import type { Note } from './notes.ts'

export interface Tuning {
  label: string
  notes: Note[]
  markedNote: string // the fifth of the root — these strings get a colored marker
}

export const TUNINGS: Tuning[] = [
  {
    label: 'D Major Pentatonic (default)',
    markedNote: 'A',
    notes: [
      'D2', 'E2', 'F#2', 'A2', 'B2',
      'D3', 'E3', 'F#3', 'A3', 'B3',
      'D4', 'E4', 'F#4', 'A4', 'B4',
      'D5', 'E5', 'F#5', 'A5', 'B5',
      'D6',
    ],
  },
  {
    label: 'G Major Pentatonic',
    markedNote: 'D',
    notes: [
      'G2', 'A2', 'B2', 'D3', 'E3',
      'G3', 'A3', 'B3', 'D4', 'E4',
      'G4', 'A4', 'B4', 'D5', 'E5',
      'G5', 'A5', 'B5', 'D6', 'E6',
      'G6',
    ],
  },
  {
    label: 'C Major Pentatonic',
    markedNote: 'G',
    notes: [
      'C2', 'D2', 'E2', 'G2', 'A2',
      'C3', 'D3', 'E3', 'G3', 'A3',
      'C4', 'D4', 'E4', 'G4', 'A4',
      'C5', 'D5', 'E5', 'G5', 'A5',
      'C6',
    ],
  },
  {
    label: 'F Major Pentatonic',
    markedNote: 'C',
    notes: [
      'F2', 'G2', 'A2', 'C3', 'D3',
      'F3', 'G3', 'A3', 'C4', 'D4',
      'F4', 'G4', 'A4', 'C5', 'D5',
      'F5', 'G5', 'A5', 'C6', 'D6',
      'F6',
    ],
  },
  {
    label: 'Bb Major Pentatonic',
    markedNote: 'F',
    notes: [
      'Bb1', 'C2', 'D2', 'F2', 'G2',
      'Bb2', 'C3', 'D3', 'F3', 'G3',
      'Bb3', 'C4', 'D4', 'F4', 'G4',
      'Bb4', 'C5', 'D5', 'F5', 'G5',
      'Bb5',
    ],
  },
  {
    label: 'A Minor Pentatonic',
    markedNote: 'E',
    notes: [
      'A1', 'C2', 'D2', 'E2', 'G2',
      'A2', 'C3', 'D3', 'E3', 'G3',
      'A3', 'C4', 'D4', 'E4', 'G4',
      'A4', 'C5', 'D5', 'E5', 'G5',
      'A5',
    ],
  },
]

export const DEFAULT_TUNING = TUNINGS[0].notes
