import { noteToFreq, type Note } from './notes.ts'

const SOUNDFONT_URL =
  'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/koto-mp3.js'

let ctx: AudioContext | null = null

function getContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// load soundfont
type SoundfontMap = Map<string, AudioBuffer>

let soundfont: SoundfontMap | null = null
let soundfontPromise: Promise<SoundfontMap> | null = null

async function decodeDataUri(dataUri: string): Promise<AudioBuffer> {
  const base64 = dataUri.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  // slice so decodeAudioData doesn't detach typed array backing buffer
  return getContext().decodeAudioData(bytes.buffer.slice(0))
}

async function fetchSoundfont(): Promise<SoundfontMap> {
  const res = await fetch(SOUNDFONT_URL)
  if (!res.ok) throw new Error(`soundfont fetch failed: ${res.status}`)
  const text = await res.text()

  const map = new Map<string, AudioBuffer>()
  const re = /"([A-G][#b]?\d)":\s*"(data:audio\/[^"]+)"/g
  const jobs: Promise<void>[] = []

  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const [, name, uri] = m
    jobs.push(decodeDataUri(uri).then((buf) => { map.set(name, buf) }))
  }

  await Promise.all(jobs)
  return map
}

function ensureSoundfont(): Promise<SoundfontMap> {
  if (soundfontPromise) return soundfontPromise
  soundfontPromise = fetchSoundfont()
    .then((map) => { soundfont = map; return map })
    .catch((err) => {
      console.warn('[guzheng] soundfont load failed:', err)
      soundfontPromise = null
      return new Map<string, AudioBuffer>()
    })
  return soundfontPromise
}

// find soundfont note closest in pitch to target and return buffer
function findNearest(target: Note): { buffer: AudioBuffer; rate: number } | null {
  if (!soundfont?.size) return null
  const targetFreq = noteToFreq(target)
  if (!targetFreq) return null

  let bestBuffer: AudioBuffer | null = null
  let bestSemitones = Infinity

  for (const [name, buf] of soundfont) {
    const freq = noteToFreq(name)
    if (!freq) continue
    const semitones = 12 * Math.log2(targetFreq / freq)
    if (Math.abs(semitones) < Math.abs(bestSemitones)) {
      bestSemitones = semitones
      bestBuffer = buf
    }
  }

  return bestBuffer
    ? { buffer: bestBuffer, rate: Math.pow(2, bestSemitones / 12) }
    : null
}

export interface Voice {
  bend(semitones: number): void
  stop(): void
}

function startVoice(note: Note, gain: number): Voice {
  const c = getContext()
  const src = c.createBufferSource()
  const g = c.createGain()
  g.gain.value = gain
  src.connect(g).connect(c.destination)

  const nearest = findNearest(note)
  if (!nearest) return { bend() {}, stop() {} }
  src.buffer = nearest.buffer
  src.playbackRate.value = nearest.rate

  src.start()

  const baseRate = src.playbackRate.value

  return {
    bend(semitones: number) {
      src.playbackRate.setTargetAtTime(
        baseRate * Math.pow(2, semitones / 12),
        c.currentTime,
        0.015,
      )
    },
    stop() {
      const t = c.currentTime
      g.gain.setTargetAtTime(0.0001, t, 0.08)
      try { src.stop(t + 0.6) } catch { }
    },
  }
}

export function pluck(note: Note, gain = 0.9): Voice {
  getContext()
  return startVoice(note, gain)
}

export function preloadSamples(): void {
  void ensureSoundfont()
}
