export type Note = string

const SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

export function noteToFreq(note: Note): number | null {
  const match = /^([A-G][#b]?)(-?\d+)$/.exec(note.trim())
  if (!match) return null
  const [, letter, octaveStr] = match
  const semitone = SEMITONES[letter]
  if (semitone === undefined) return null
  const octave = parseInt(octaveStr, 10)

  // MIDI note number
  const midi = (octave + 1) * 12 + semitone
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export const ALL_NOTES: Note[] = (() => {
  const letters = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const out: Note[] = []
  for (let octave = 1; octave <= 6; octave++) {
    for (const l of letters) out.push(`${l}${octave}`)
  }
  return out
})()
