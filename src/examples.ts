export interface Example {
  title: string
  key?: string
  time?: [beats: number, unit: number]
  tempo?: number
  tab: string
}

export const EXAMPLES: Example[] = [
  {
    title: 'Getting Started',
    key: 'D',
    time: [4, 4],
    tempo: 90,
    tab: `// Numbers are scale degrees: 1 is do, 2 is re, and so on.
1 2 3 5 | 6 1' 6 5 | 3 2 1 - ||

// _ halves a note, . dots it, - holds it another beat.
1_ 2_ 3_ 5_ 6_ 5_ 3_ 2_ | 6. 5_ 3 - ||

// A pentatonic guzheng has no strings tuned to 4 or 7, so a bend must be played
1 2 3 4 | 5 6 7 1' ||`,
  },
  {
    title: 'Techniques',
    key: 'D',
    time: [4, 4],
    tempo: 80,
    tab: `// ~ rakes across every string in between
1,~1'' - | 1''~1, - |

// chords roll slightly, like a real hand
[135] - [1'35] - | [1'3'5'] - - - |

// * tremolo, ^ press up, v vibrato
5* - - - | 3^ - 6v - ||`,
  },
  {
    title: 'Arpeggio Study',
    key: 'D',
    time: [3, 4],
    tempo: 110,
    tab: `|: 1_ 3_ 5_ 1'_ 5_ 3_ | 2_ 5_ 6_ 2'_ 6_ 5_ :|x2
|: 3_ 5_ 6_ 3'_ 6_ 5_ | 1_ 3_ 5_ 1'_ 5_ 3_ :|
1'~1, - - ||`,
  },
  {
    title: 'String Numbers',
    tempo: 100,
    tab: `// s<n> addresses a string directly, the way koto tablature does,
// ignoring the key entirely. String 1 is the lowest.
s1 s2 s3 s4 | s5 s6 s7 s8 |
s9 s10 s11 s12 | s13 s14 s15 s16 |
[s1 s3 s5] - [s8 s10 s12] - | s21~s1 - - - ||`,
  },
]

// Renders an example back into notation source, header lines first
export function exampleSource(ex: Example): string {
  const header = [
    ex.key !== undefined ? `1=${ex.key}` : null,
    ex.time !== undefined ? `${ex.time[0]}/${ex.time[1]}` : null,
    ex.tempo !== undefined ? `tempo=${ex.tempo}` : null,
    `title: ${ex.title}`,
  ].filter((line): line is string => line !== null)

  return `${header.join('\n')}\n\n${ex.tab}`
}
