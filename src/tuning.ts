import type { Note } from './notes.ts'

export interface Scale {
  label: string
  intervals: number[]
  markedInterval: number
}

export const SCALES: Scale[] = [
  { label: 'Major Pentatonic',  intervals: [0, 2, 4, 7, 9],  markedInterval: 7 },
  { label: 'Minor Pentatonic',  intervals: [0, 3, 5, 7, 10], markedInterval: 7 },
  { label: 'Hirajoshi',         intervals: [0, 2, 3, 7, 8],  markedInterval: 7 },
  { label: 'Nogijoshi',         intervals: [0, 2, 5, 7, 11], markedInterval: 7 },
  { label: 'Gakujoshi',         intervals: [0, 2, 5, 7, 10], markedInterval: 7 },
  { label: 'Diatonic Major',    intervals: [0, 2, 4, 5, 7, 9, 11], markedInterval: 7 },
  { label: 'Diatonic Minor',    intervals: [0, 2, 3, 5, 7, 8, 10], markedInterval: 7 },
  { label: 'Chromatic',        intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], markedInterval: 0 },
]

export const KEYS = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
] as const
export type Key = typeof KEYS[number]

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_NAMES  = ['C', 'Db', 'D', 'Eb',  'E', 'F', 'Gb',  'G', 'Ab',  'A', 'Bb',  'B']
const FLAT_KEYS   = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'])

const KEY_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

export function buildTuning(key: string, scale: Scale, count = 21): Note[] {
  const root = KEY_SEMITONE[key] ?? 0
  const names = FLAT_KEYS.has(key) ? FLAT_NAMES : SHARP_NAMES
  const notes: Note[] = []
  let octave = 2

  while (notes.length < count) {
    for (const interval of scale.intervals) {
      if (notes.length >= count) break
      const abs = root + interval
      notes.push(`${names[abs % 12]}${octave + Math.floor(abs / 12)}`)
    }
    octave++
  }

  return notes
}

export function markedNoteForKey(key: string, scale: Scale): string {
  const root = KEY_SEMITONE[key] ?? 0
  const names = FLAT_KEYS.has(key) ? FLAT_NAMES : SHARP_NAMES
  return names[(root + scale.markedInterval) % 12]
}

export const DEFAULT_KEY: Key = 'D'
export const DEFAULT_SCALE: Scale = SCALES[0]
export const DEFAULT_TUNING: Note[] = buildTuning(DEFAULT_KEY, DEFAULT_SCALE)
