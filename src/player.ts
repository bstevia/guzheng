// Compiles a parsed score into a flat and ordered list of plucks and plays them back

import { pluck, type Voice } from './audio.ts'
import { noteToMidi, type Note } from './notes.ts'
import { resolvePitch, type ResolveContext, type Score, type Step } from './notation.ts'

const BASE_GAIN = 0.85
const ACCENT_GAIN = 1.0
const GLISS_GAIN = 0.7

const ROLL_MS = 12
/** Tremolo plucks no faster than this, however short the note. */
const MIN_TREMOLO_MS = 45
/** How far a `^` press-bend travels. */
const PRESS_SEMITONES = 2
const VIBRATO_DEPTH = 0.3
const VIBRATO_HZ = 5.5

export interface Action {
  /** Milliseconds from the start of playback. */
  at: number
  note: Note
  /** String to light up, or -1 when the pitch is off the board. */
  string: number
  gain: number
  /** Semitones already held down as the string is plucked. */
  press: number
  /** Semitones to slide up to after the onset. */
  slideTo: number
  slideMs: number
  vibrato: boolean
  /** How long the note is written to last. */
  durMs: number
}

export interface StepTime {
  id: number
  at: number
  durMs: number
}

export interface Compiled {
  actions: Action[]
  stepTimes: StepTime[]
  totalMs: number
  offBoard: string[]
}

function compileStep(
  step: Step,
  at: number,
  beatMs: number,
  ctx: ResolveContext,
  out: Action[],
  offBoard: string[],
): void {
  const durMs = step.beats * beatMs
  if (!step.pitches.length) return

  const gain = step.art.accent ? ACCENT_GAIN : BASE_GAIN
  const resolved = step.pitches
    .map((p) => resolvePitch(p, ctx))
    .filter((r): r is NonNullable<typeof r> => r !== null)

  for (const r of resolved) {
    if (r.offBoard && !offBoard.includes(r.note)) offBoard.push(r.note)
  }
  if (!resolved.length) return

  if (step.art.gliss) {
    const target = resolvePitch(step.art.gliss, ctx)
    const from = resolved[0]
    if (target && from.string !== -1 && target.string !== -1 && from.string !== target.string) {
      const dir = target.string > from.string ? 1 : -1
      const count = Math.abs(target.string - from.string) + 1
      const span = durMs * 0.85
      for (let n = 0; n < count; n++) {
        const idx = from.string + dir * n
        out.push({
          at: at + (span * n) / count,
          note: ctx.tuning[idx],
          string: idx,
          gain: GLISS_GAIN,
          press: 0,
          slideTo: 0,
          slideMs: 0,
          vibrato: false,
          durMs: durMs - (span * n) / count,
        })
      }
      return
    }
    // play it as a plain note if the sweep can't be traced
  }

  const slideTo = step.art.press ? PRESS_SEMITONES : 0
  const slideMs = durMs * 0.55

  if (step.art.tremolo) {
    const interval = Math.max(MIN_TREMOLO_MS, beatMs / 4)
    const count = Math.max(2, Math.round(durMs / interval))
    for (let n = 0; n < count; n++) {
      const t = at + (durMs * n) / count
      for (const r of resolved) {
        out.push({
          at: t,
          note: r.note,
          string: r.string,
          gain: (n % 2 === 0 ? gain : gain * 0.78) * 0.9,
          press: r.press,
          slideTo: slideTo ? r.press + slideTo : 0,
          slideMs: durMs - (durMs * n) / count,
          vibrato: false,
          durMs: durMs - (durMs * n) / count,
        })
      }
    }
    return
  }

  const rolled = [...resolved].sort(
    (a, b) => ((noteToMidi(a.note) ?? 0) + a.press) - ((noteToMidi(b.note) ?? 0) + b.press),
  )

  rolled.forEach((r, n) => {
    out.push({
      at: at + n * ROLL_MS,
      note: r.note,
      string: r.string,
      gain,
      press: r.press,
      slideTo: slideTo ? r.press + slideTo : 0,
      slideMs,
      vibrato: step.art.vibrato,
      durMs,
    })
  })
}

export function compileScore(score: Score, ctx: ResolveContext, bpm: number): Compiled {
  const beatMs = 60000 / bpm
  const actions: Action[] = []
  const stepTimes: StepTime[] = []
  const offBoard: string[] = []
  let at = 0

  for (const step of score.steps) {
    const durMs = step.beats * beatMs
    stepTimes.push({ id: step.id, at, durMs })
    compileStep(step, at, beatMs, ctx, actions, offBoard)
    at += durMs
  }

  actions.sort((a, b) => a.at - b.at)
  return { actions, stepTimes, totalMs: at, offBoard }
}

// ------------------------------------------------------------------ playback

export interface PlayerCallbacks {
  onStrike(strings: number[]): void
  onStep(id: number): void
  onEnd(): void
}

const TICK_MS = 10
/** Fire anything due within this window so timer jitter doesn't lag notes. */
const LOOKAHEAD_MS = 15

export class Player {
  private timer: ReturnType<typeof setTimeout> | null = null
  private ramps: ReturnType<typeof setInterval>[] = []
  private voices: Voice[] = []
  private startedAt = 0
  private cursor = 0
  private stepCursor = -1
  private compiled: Compiled | null = null
  private cb: PlayerCallbacks | null = null
  private looping = false

  get playing(): boolean {
    return this.timer !== null
  }

  play(compiled: Compiled, cb: PlayerCallbacks, loop = false): void {
    this.stop()
    if (!compiled.actions.length && !compiled.totalMs) {
      cb.onEnd()
      return
    }
    this.compiled = compiled
    this.cb = cb
    this.looping = loop
    this.cursor = 0
    this.stepCursor = -1
    this.startedAt = performance.now()
    this.tick()
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    for (const r of this.ramps) clearInterval(r)
    this.ramps = []
    for (const v of this.voices) v.stop()
    this.voices = []
    this.compiled = null
    this.cb = null
  }

  /** Milliseconds elapsed, for a progress bar. */
  elapsed(): number {
    return this.timer === null ? 0 : performance.now() - this.startedAt
  }

  private tick = (): void => {
    const compiled = this.compiled
    const cb = this.cb
    if (!compiled || !cb) return

    const now = performance.now() - this.startedAt
    const struck: number[] = []

    while (
      this.cursor < compiled.actions.length &&
      compiled.actions[this.cursor].at <= now + LOOKAHEAD_MS
    ) {
      const action = compiled.actions[this.cursor++]
      this.fire(action)
      if (action.string !== -1) struck.push(action.string)
    }
    if (struck.length) cb.onStrike(struck)

    // Report the step the playhead is inside so the score can follow along.
    let step = this.stepCursor
    for (let n = Math.max(0, this.stepCursor); n < compiled.stepTimes.length; n++) {
      if (compiled.stepTimes[n].at <= now) step = n
      else break
    }
    if (step !== this.stepCursor && step >= 0) {
      this.stepCursor = step
      cb.onStep(compiled.stepTimes[step].id)
    }

    if (this.cursor >= compiled.actions.length && now >= compiled.totalMs) {
      if (this.looping) {
        this.cursor = 0
        this.stepCursor = -1
        this.startedAt = performance.now()
      } else {
        this.timer = null
        this.compiled = null
        this.cb = null
        cb.onEnd()
        return
      }
    }

    this.timer = setTimeout(this.tick, TICK_MS)
  }

  private fire(action: Action): void {
    const voice = pluck(action.note, action.gain)
    this.voices.push(voice)
    // Keep the ring-out list from growing without bound on long scores.
    if (this.voices.length > 64) this.voices.splice(0, this.voices.length - 64)

    let base = action.press
    if (base) voice.bend(base)

    if (action.slideTo > base && action.slideMs > 0) {
      const from = base
      const steps = Math.max(4, Math.round(action.slideMs / 20))
      let n = 0
      const ramp = setInterval(() => {
        n++
        base = from + ((action.slideTo - from) * n) / steps
        voice.bend(base)
        if (n >= steps) {
          clearInterval(ramp)
          this.ramps = this.ramps.filter((r) => r !== ramp)
        }
      }, action.slideMs / steps)
      this.ramps.push(ramp)
    }

    if (action.vibrato) {
      const started = performance.now()
      const vib = setInterval(() => {
        const t = (performance.now() - started) / 1000
        if (t * 1000 > action.durMs + 400) {
          clearInterval(vib)
          this.ramps = this.ramps.filter((r) => r !== vib)
          return
        }
        voice.bend(base + Math.sin(t * 2 * Math.PI * VIBRATO_HZ) * VIBRATO_DEPTH)
      }, 25)
      this.ramps.push(vib)
    }
  }
}
