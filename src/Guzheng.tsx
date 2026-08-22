import { useRef, useState, useEffect, type PointerEvent } from 'react'
import { pluck, preloadSamples, type Voice } from './audio.ts'
import type { Note } from './notes.ts'

interface GuzhengProps {
  tuning: Note[]
  markedNote: string | null
  pulse?: { strings: number[]; seq: number } | null
  /** Reports strings the user just plucked by hand, for a live notation readout. */
  onPlay?: (strings: number[]) => void
}

function isTextEntry(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el?.tagName) return false
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable
  )
}

const BRIDGE_FRACTION = 0.28
const MAX_BEND = 2
const BEND_RANGE_PX = 200

// change when adding extra octaves ???
const STRUM_KEYS: { code: string; label: string }[] = [
  { code: 'KeyA', label: 'A' }, { code: 'KeyS', label: 'S' }, { code: 'KeyD', label: 'D' },
  { code: 'KeyF', label: 'F' }, { code: 'KeyG', label: 'G' }, { code: 'KeyH', label: 'H' },
  { code: 'KeyJ', label: 'J' }, { code: 'KeyK', label: 'K' }, { code: 'KeyL', label: 'L' },
  { code: 'Semicolon', label: ';' }, { code: 'Quote', label: "'" },
  { code: 'KeyZ', label: 'Z' }, { code: 'KeyX', label: 'X' }, { code: 'KeyC', label: 'C' },
  { code: 'KeyV', label: 'V' }, { code: 'KeyB', label: 'B' }, { code: 'KeyN', label: 'N' },
  { code: 'KeyM', label: 'M' }, { code: 'Comma', label: ',' }, { code: 'Period', label: '.' },
  { code: 'Slash', label: '/' },
]

const STRUM_INDEX: Record<string, number> = Object.fromEntries(
  STRUM_KEYS.map((k, i) => [k.code, i]),
)

function letterOf(note: Note): string {
  return /^([A-G][#b]?)/.exec(note)?.[1] ?? ''
}

type BendSource = 'key' | 'bridge'

export default function Guzheng({ tuning, markedNote, pulse, onPlay }: GuzhengProps) {
  const order = [...tuning.keys()]

  function isMarked(note: Note, index: number): boolean {
    if (markedNote !== null) return letterOf(note) === markedNote
    return index % 5 === 0
  }

  const boardRef = useRef<HTMLDivElement>(null)
  const playing = useRef(false)
  const lastIndex = useRef(-1)
  const bendKeyHeld = useRef(false)
  const lastPointerY = useRef<number | null>(null)
  const heldKeys = useRef<Set<string>>(new Set())
  const litTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const lastVoice = useRef<Map<number, Voice>>(new Map())
  // Keys pressed within this window of each other are reported as one chord,
  // the same way holding several strum keys together sounds as one.
  const chordBuffer = useRef<number[]>([])
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bend = useRef<{
    voice: Voice
    index: number
    anchorY: number
    source: BendSource
  } | null>(null)

  const [active, setActive] = useState(-1)
  const [lit, setLit] = useState<Set<number>>(new Set())
  const [bending, setBending] = useState(false)

  function reportKeyPlay(index: number): void {
    chordBuffer.current.push(index)
    if (chordTimer.current) clearTimeout(chordTimer.current)
    chordTimer.current = setTimeout(() => {
      onPlay?.(chordBuffer.current)
      chordBuffer.current = []
      chordTimer.current = null
    }, 35)
  }

  function highlight(index: number): void {
    setActive(index)
    setTimeout(() => setActive((cur) => (cur === index ? -1 : cur)), 180)
  }

  // Like highlight(), but supports many strings glowing at once (chords) since
  // each lit string tracks its own fade-out timer.
  function flash(index: number): void {
    setLit((prev) => new Set(prev).add(index))
    const existing = litTimers.current.get(index)
    if (existing) clearTimeout(existing)
    litTimers.current.set(index, setTimeout(() => {
      setLit((prev) => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
      litTimers.current.delete(index)
    }, 180))
  }

  function indexFromY(clientY: number): number {
    const board = boardRef.current
    if (!board) return -1
    const rows = board.querySelectorAll<HTMLElement>('[data-string]')
    for (const el of rows) {
      const r = el.getBoundingClientRect()
      if (clientY >= r.top && clientY <= r.bottom) return Number(el.dataset.string)
    }
    return -1
  }

  function inBridgeZone(clientX: number): boolean {
    const board = boardRef.current
    if (!board) return false
    const r = board.getBoundingClientRect()
    return clientX < r.left + r.width * BRIDGE_FRACTION
  }

  function startKeyBend(index: number, anchorY: number): void {
    const existing = lastVoice.current.get(index)
    if (!existing) return
    bend.current = { voice: existing, index, anchorY, source: 'key' }
    setActive(index)
  }

  function startBridgeBend(index: number, anchorY: number): void {
    const voice = pluck(tuning[index])
    lastVoice.current.set(index, voice)
    bend.current = { voice, index, anchorY, source: 'bridge' }
    setBending(true)
    setActive(index)
    onPlay?.([index])
  }

  function applyBend(clientY: number): void {
    if (!bend.current) return
    const t = Math.abs(clientY - bend.current.anchorY) / BEND_RANGE_PX
    const semitones = Math.max(0, Math.min(1, t)) * MAX_BEND
    bend.current.voice.bend(semitones)
  }

  function endBend(): void {
    const b = bend.current
    if (!b) return
    bend.current = null
    b.voice.bend(0)
    if (b.source === 'bridge') setBending(false)
    setActive((cur) => (cur === b.index ? -1 : cur))
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isTextEntry(e.target)) return
      const strumIdx = STRUM_INDEX[e.code]
      if (strumIdx !== undefined) {
        // Prevent browser defaults (e.g. Firefox's quick-find on `/` and `'`).
        e.preventDefault()
        // Guard against auto-repeat so a held key plucks only once. Each
        // simultaneously-held key gets its own voice, so chords just work.
        if (e.repeat || heldKeys.current.has(e.code)) return
        if (strumIdx >= tuning.length) return
        heldKeys.current.add(e.code)
        const voice = pluck(tuning[strumIdx])
        lastVoice.current.set(strumIdx, voice)
        flash(strumIdx)
        reportKeyPlay(strumIdx)
        return
      }

      if (e.code !== 'KeyQ' || bendKeyHeld.current) return
      bendKeyHeld.current = true
      playing.current = false
      lastIndex.current = -1
      setBending(true)
      const y = lastPointerY.current
      if (y !== null) {
        const idx = indexFromY(y)
        if (idx !== -1) startKeyBend(idx, y)
      }
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (STRUM_INDEX[e.code] !== undefined) {
        heldKeys.current.delete(e.code)
        return
      }
      if (e.code !== 'KeyQ') return
      bendKeyHeld.current = false
      setBending(false)
      if (bend.current?.source === 'key') endBend()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [tuning])

  useEffect(() => {
    preloadSamples()
  }, [tuning])

  useEffect(() => {
    if (!pulse) return
    for (const i of pulse.strings) flash(i)
  }, [pulse?.seq])

  function handleDown(e: PointerEvent<HTMLDivElement>): void {
    lastPointerY.current = e.clientY
    if (bendKeyHeld.current) return
    const idx = indexFromY(e.clientY)
    if (idx === -1) return
    e.currentTarget.setPointerCapture?.(e.pointerId)

    if (inBridgeZone(e.clientX)) {
      startBridgeBend(idx, e.clientY)
    } else {
      playing.current = true
      lastIndex.current = idx
      const voice = pluck(tuning[idx])
      lastVoice.current.set(idx, voice)
      highlight(idx)
      onPlay?.([idx])
    }
  }

  function handleMove(e: PointerEvent<HTMLDivElement>): void {
    lastPointerY.current = e.clientY

    if (bend.current) {
      applyBend(e.clientY)
      return
    }

    if (bendKeyHeld.current) {
      const idx = indexFromY(e.clientY)
      if (idx !== -1) startKeyBend(idx, e.clientY)
      return
    }

    if (!playing.current) return
    const idx = indexFromY(e.clientY)
    if (idx !== -1 && idx !== lastIndex.current) {
      lastIndex.current = idx
      const voice = pluck(tuning[idx])
      lastVoice.current.set(idx, voice)
      highlight(idx)
      onPlay?.([idx])
    }
  }

  function handleUp(): void {
    if (bend.current?.source === 'bridge') endBend()
    playing.current = false
    lastIndex.current = -1
  }

  return (
    <div
      ref={boardRef}
      className={'board' + (bending ? ' bend-mode' : '')}
      style={{ ['--bridge' as string]: `${BRIDGE_FRACTION * 100}%` }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
      onPointerCancel={handleUp}
    >
      <div className="bend-zone" aria-hidden />
      <div className="bridge" aria-hidden />

      {order.map((i) => {
        const note = tuning[i]
        const keyLabel = STRUM_KEYS[i]?.label
        return (
          <div
            key={i}
            data-string={i}
            className={
              'string' +
              (isMarked(note, i) ? ' marked' : '') +
              (active === i || lit.has(i) ? ' active' : '')
            }
            title={note}
          >
            <span className="wire" />
            {keyLabel && <span className="keycap" aria-hidden>{keyLabel}</span>}
            <span className="label">{note}</span>
          </div>
        )
      })}
    </div>
  )
}
