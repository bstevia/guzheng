import { midiToNote, noteToMidi, SEMITONES, type Note } from './notes.ts'

// do re mi fa sol la ti — jianpu degrees are always read against a major scale.
export const DEGREE_SEMITONES = [0, 2, 4, 5, 7, 9, 11]

const MAX_REPEAT = 8

export interface PitchSpec {
  kind: 'degree' | 'string'
  degree: number // 1-7 for 'degree'
  alter: number // semitone alteration from # / b prefixes
  octave: number // octave displacement from ' and , marks
  index: number
}

export interface Articulation {
  tremolo: boolean
  press: boolean
  vibrato: boolean
  accent: boolean
  gliss: PitchSpec | null
}

export interface Step {
  id: number
  pitches: PitchSpec[]
  art: Articulation
  beats: number
  halves: number
  dots: number
  extend: number
  line: number
  text: string
}

export type BarStyle = 'single' | 'double' | 'repeat-start' | 'repeat-end'

export type Item =
  | { kind: 'step'; step: Step }
  | { kind: 'bar'; style: BarStyle; times: number }

export interface ScoreMeta {
  key: string | null
  tempo: number | null
  beatsPerBar: number | null
  beatUnit: number | null
  title: string | null
}

export interface ParseError {
  line: number
  message: string
  text: string
}

export interface Score {
  meta: ScoreMeta
  items: Item[]
  steps: Step[]
  errors: ParseError[]
}

// ---------------------------------------------------------------- tokenizing

interface Token {
  text: string
  line: number
}

const BAR_TOKENS = new Set(['|', '||', '|:', ':|'])

function tokenize(src: string): { tokens: Token[]; errors: ParseError[] } {
  const tokens: Token[] = []
  const errors: ParseError[] = []

  src.split('\n').forEach((rawLine, i) => {
    const line = i + 1
    const text = rawLine.replace(/\/\/.*$/, '')
    if (!text.trim()) return

    let j = 0
    while (j < text.length) {
      const ch = text[j]

      if (/\s/.test(ch)) { j++; continue }

      // Barlines and repeat marks.
      if (ch === '|' || ch === ':') {
        const two = text.slice(j, j + 2)
        if (BAR_TOKENS.has(two)) {
          if (two === ':|') {
            // `:|x3` means play the section three times in total.
            const rep = /^x(\d+)/.exec(text.slice(j + 2))
            tokens.push({ text: rep ? `:|x${rep[1]}` : ':|', line })
            j += 2 + (rep ? rep[0].length : 0)
          } else {
            tokens.push({ text: two, line })
            j += 2
          }
          continue
        }
        if (ch === '|') { tokens.push({ text: '|', line }); j++; continue }
        errors.push({ line, message: 'stray `:` — did you mean `:|`?', text: ':' })
        j++
        continue
      }

      if (ch === '[') {
        const close = text.indexOf(']', j)
        if (close === -1) {
          errors.push({ line, message: 'unclosed chord bracket', text: text.slice(j) })
          break
        }
        let end = close + 1
        while (end < text.length && !/[\s|[]/.test(text[end])) end++
        tokens.push({ text: text.slice(j, end), line })
        j = end
        continue
      }

      let end = j
      while (end < text.length && !/[\s|[]/.test(text[end])) end++
      tokens.push({ text: text.slice(j, end), line })
      j = end
    }
  })

  return { tokens, errors }
}

// --------------------------------------------------------------- directives

function parseDirective(raw: string): Partial<ScoreMeta> | null {
  const s = raw.trim()

  let m = /^1\s*=\s*([A-G][#b]?)$/.exec(s)
  if (m) return { key: m[1] }

  m = /^(\d+)\s*\/\s*(\d+)$/.exec(s)
  if (m) return { beatsPerBar: parseInt(m[1], 10), beatUnit: parseInt(m[2], 10) }

  m = /^(?:tempo|bpm|♩)\s*=\s*(\d+)$/i.exec(s)
  if (m) return { tempo: parseInt(m[1], 10) }

  m = /^(?:title|@title)\s*[=:]\s*(.+)$/i.exec(s)
  if (m) return { title: m[1].trim() }

  return null
}

// ------------------------------------------------------------- step parsing

// Reads one pitch starting at `i`; returns null when nothing parses
function readPitch(s: string, i: number): { spec: PitchSpec; next: number } | null {
  let alter = 0
  while (i < s.length && (s[i] === '#' || s[i] === 'b')) {
    alter += s[i] === '#' ? 1 : -1
    i++
  }

  let spec: PitchSpec | null = null

  if (s[i] === 's') {
    const m = /^\d+/.exec(s.slice(i + 1))
    if (!m) return null
    spec = { kind: 'string', degree: 0, alter, octave: 0, index: parseInt(m[0], 10) }
    i += 1 + m[0].length
  } else if (s[i] >= '0' && s[i] <= '7') {
    spec = { kind: 'degree', degree: Number(s[i]), alter, octave: 0, index: 0 }
    i++
  } else {
    return null
  }

  while (i < s.length && (s[i] === "'" || s[i] === ',')) {
    spec.octave += s[i] === "'" ? 1 : -1
    i++
  }

  return { spec, next: i }
}

function emptyArticulation(): Articulation {
  return { tremolo: false, press: false, vibrato: false, accent: false, gliss: null }
}

function parseStep(tok: Token): { step: Step } | { error: string } {
  const s = tok.text
  const pitches: PitchSpec[] = []
  const art = emptyArticulation()
  let i = 0

  if (s[0] === '[') {
    i = 1
    while (i < s.length && s[i] !== ']') {
      if (/\s/.test(s[i])) { i++; continue }
      const read = readPitch(s, i)
      if (!read) return { error: `cannot read chord tone at "${s.slice(i)}"` }
      if (read.spec.kind === 'degree' && read.spec.degree === 0) {
        return { error: '0 is a rest and cannot be a chord tone' }
      }
      pitches.push(read.spec)
      i = read.next
    }
    if (s[i] !== ']') return { error: 'unclosed chord bracket' }
    i++
    if (!pitches.length) return { error: 'empty chord' }
  } else {
    const read = readPitch(s, 0)
    if (!read) return { error: `not a note — expected 1-7, 0, or s<number>` }
    pitches.push(read.spec)
    i = read.next
  }

  let halves = 0
  let dots = 0

  while (i < s.length) {
    const ch = s[i]
    if (ch === '_') { halves++; i++; continue }
    if (ch === '.') { dots++; i++; continue }
    if (ch === '*') { art.tremolo = true; i++; continue }
    if (ch === '^') { art.press = true; i++; continue }
    if (ch === 'v') { art.vibrato = true; i++; continue }
    if (ch === '>') { art.accent = true; i++; continue }
    if (ch === '~') {
      const read = readPitch(s, i + 1)
      if (!read) return { error: 'glissando `~` needs a destination note' }
      art.gliss = read.spec
      i = read.next
      continue
    }
    return { error: `unexpected "${ch}"` }
  }

  // A dot adds half of what came before it: one dot = x1.5, two = x1.75.
  const beats = Math.pow(0.5, halves) * (2 - Math.pow(2, -dots))

  const isRest = pitches.length === 1 && pitches[0].kind === 'degree' && pitches[0].degree === 0

  return {
    step: {
      id: 0,
      pitches: isRest ? [] : pitches,
      art,
      beats,
      halves,
      dots,
      extend: 0,
      line: tok.line,
      text: s,
    },
  }
}

// ------------------------------------------------------------------ repeats

function cloneItem(it: Item): Item {
  return it.kind === 'step'
    ? { kind: 'step', step: { ...it.step, pitches: it.step.pitches.map((p) => ({ ...p })) } }
    : { ...it }
}

function expandRepeats(items: Item[]): Item[] {
  const out: Item[] = []
  let sectionStart = 0

  for (const it of items) {
    if (it.kind === 'bar' && it.style === 'repeat-start') {
      out.push(it)
      sectionStart = out.length
      continue
    }
    if (it.kind === 'bar' && it.style === 'repeat-end') {
      const body = out.slice(sectionStart)
      const times = Math.min(Math.max(it.times, 2), MAX_REPEAT)
      for (let r = 1; r < times; r++) {
        out.push({ kind: 'bar', style: 'single', times: 1 })
        out.push(...body.map(cloneItem))
      }
      out.push({ kind: 'bar', style: 'single', times: 1 })
      sectionStart = out.length
      continue
    }
    out.push(it)
  }

  return out
}

// ------------------------------------------------------------------- parser

export function parseScore(src: string): Score {
  const meta: ScoreMeta = {
    key: null, tempo: null, beatsPerBar: null, beatUnit: null, title: null,
  }

  // Directives live on their own lines, so peel them off before tokenizing.
  const musicLines: string[] = []
  for (const rawLine of src.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '')
    const directive = line.trim() ? parseDirective(line) : null
    if (directive) {
      Object.assign(meta, directive)
      musicLines.push('')
    } else {
      musicLines.push(rawLine)
    }
  }

  const { tokens, errors } = tokenize(musicLines.join('\n'))
  const items: Item[] = []
  let last: Step | null = null

  for (const tok of tokens) {
    if (tok.text === '-') {
      if (!last) {
        errors.push({ line: tok.line, message: '`-` has no note to extend', text: '-' })
        continue
      }
      last.beats += 1
      last.extend += 1
      continue
    }

    if (tok.text === '|') { items.push({ kind: 'bar', style: 'single', times: 1 }); last = null; continue }
    if (tok.text === '||') { items.push({ kind: 'bar', style: 'double', times: 1 }); last = null; continue }
    if (tok.text === '|:') { items.push({ kind: 'bar', style: 'repeat-start', times: 1 }); last = null; continue }
    if (tok.text.startsWith(':|')) {
      const times = tok.text.length > 2 ? parseInt(tok.text.slice(3), 10) : 2
      items.push({ kind: 'bar', style: 'repeat-end', times })
      last = null
      continue
    }

    const parsed = parseStep(tok)
    if ('error' in parsed) {
      errors.push({ line: tok.line, message: parsed.error, text: tok.text })
      last = null
      continue
    }
    items.push({ kind: 'step', step: parsed.step })
    last = parsed.step
  }

  const expanded = expandRepeats(items)

  const steps: Step[] = []
  for (const it of expanded) {
    if (it.kind !== 'step') continue
    it.step.id = steps.length
    steps.push(it.step)
  }

  return { meta, items: expanded, steps, errors }
}

// ---------------------------------------------------------------- resolving

export interface ResolveContext {
  tuning: Note[]
  key: string
  baseOctave: number // octave that a plain, undotted `1` lands in.
}

export interface Resolved {
  note: Note
  string: number
  press: number
  offBoard: boolean
}

export function baseOctaveFor(tuning: Note[], key: string): number {
  const midis = tuning.map(noteToMidi).filter((m): m is number => m !== null).sort((a, b) => a - b)
  if (!midis.length) return 3
  const middle = midis[Math.floor(midis.length / 2)]
  const root = SEMITONES[key] ?? 0

  let best = 3
  let bestDist = Infinity
  for (let octave = 0; octave <= 8; octave++) {
    const dist = Math.abs((octave + 1) * 12 + root - middle)
    if (dist < bestDist) { bestDist = dist; best = octave }
  }
  return best
}

export function makeContext(tuning: Note[], key: string): ResolveContext {
  return { tuning, key, baseOctave: baseOctaveFor(tuning, key) }
}

// MIDI number a spec is written at, or null for string references
export function pitchMidi(spec: PitchSpec, ctx: ResolveContext): number | null {
  if (spec.kind === 'string') return null
  if (spec.degree < 1 || spec.degree > 7) return null
  const root = SEMITONES[ctx.key] ?? 0
  const tonic = (ctx.baseOctave + 1) * 12 + root
  return tonic + DEGREE_SEMITONES[spec.degree - 1] + spec.alter + 12 * spec.octave
}

export function resolvePitch(spec: PitchSpec, ctx: ResolveContext): Resolved | null {
  if (spec.kind === 'string') {
    const idx = spec.index - 1
    if (idx < 0 || idx >= ctx.tuning.length) return null
    return { note: ctx.tuning[idx], string: idx, press: Math.max(0, spec.alter), offBoard: false }
  }
  if (spec.degree < 1 || spec.degree > 7) return null

  const midi = pitchMidi(spec, ctx)
  if (midi === null) return null

  const stringMidis = ctx.tuning.map(noteToMidi)

  const exact = stringMidis.indexOf(midi)
  if (exact !== -1) {
    return { note: ctx.tuning[exact], string: exact, press: 0, offBoard: false }
  }

  for (const gap of [1, 2]) {
    const found = stringMidis.indexOf(midi - gap)
    if (found !== -1) {
      return { note: ctx.tuning[found], string: found, press: gap, offBoard: false }
    }
  }

  return { note: midiToNote(midi), string: -1, press: 0, offBoard: true }
}

export function pitchHeight(spec: PitchSpec, ctx: ResolveContext): number {
  if (spec.kind === 'string') {
    const note = ctx.tuning[spec.index - 1]
    return (note ? noteToMidi(note) : null) ?? 0
  }
  return pitchMidi(spec, ctx) ?? 0
}

/** Human-readable pitch name for a spec, used for tooltips. */
export function describePitch(spec: PitchSpec, ctx: ResolveContext): string {
  if (spec.kind === 'string') {
    return ctx.tuning[spec.index - 1] ?? `string ${spec.index}`
  }
  const midi = pitchMidi(spec, ctx)
  return midi === null ? '?' : midiToNote(midi)
}
