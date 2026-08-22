import { useEffect, useMemo, useRef, useState } from 'react'
import {
  makeContext, parseScore, describePitch, pitchHeight,
  noteToPitchSpec, pitchSpecToInput, emptyArticulation,
  type Item, type PitchSpec, type ResolveContext, type Step,
} from './notation.ts'
import { compileScore, Player } from './player.ts'
import { EXAMPLES, exampleSource } from './examples.ts'
import type { Note } from './notes.ts'

interface NotationProps {
  tuning: Note[]
  musicKey: string
  onStrike: (strings: number[]) => void
  onRequestKey: (key: string) => void
  /** Strings the user just plucked by hand, shown as a live notation readout. */
  livePlay?: { strings: number[]; seq: number } | null
}

const DEFAULT_TEMPO = 84

// -------------------------------------------------------------- jianpu view

function digitLabel(spec: PitchSpec): string {
  const accidental = spec.alter > 0 ? '♯'.repeat(spec.alter)
    : spec.alter < 0 ? '♭'.repeat(-spec.alter)
    : ''
  return accidental + (spec.kind === 'string' ? spec.index : spec.degree)
}

function Digit({ spec }: { spec: PitchSpec }) {
  const up = Math.max(0, spec.octave)
  const down = Math.max(0, -spec.octave)
  return (
    <span className="jp-digit">
      <span className="jp-od">{'·'.repeat(up)}</span>
      <span className={'jp-num' + (spec.kind === 'string' ? ' jp-str' : '')}>
        {digitLabel(spec)}
      </span>
      <span className="jp-od">{'·'.repeat(down)}</span>
    </span>
  )
}

function StepView({ step, ctx, playing }: { step: Step; ctx: ResolveContext; playing: boolean }) {
  const marks = [
    step.art.accent ? '>' : '',
    step.art.tremolo ? '≋' : '',
    step.art.press ? '↗' : '',
    step.art.vibrato ? '∿' : '',
  ].join('')

  const title = step.pitches.length
    ? step.pitches.map((p) => describePitch(p, ctx)).join(' + ') + `  ·  ${step.beats} beat${step.beats === 1 ? '' : 's'}`
    : `rest · ${step.beats} beat${step.beats === 1 ? '' : 's'}`

  return (
    <>
      <span className={'jp-step' + (playing ? ' playing' : '')} title={title} data-step={step.id}>
        {marks && <span className="jp-marks">{marks}</span>}
        <span className="jp-stack">
          {/* Jianpu stacks a chord by pitch, lowest tone at the bottom. */}
          {step.pitches.length
            ? [...step.pitches]
                .sort((a, b) => pitchHeight(b, ctx) - pitchHeight(a, ctx))
                .map((p, i) => <Digit key={i} spec={p} />)
            : <Digit spec={{ kind: 'degree', degree: 0, alter: 0, octave: 0, index: 0 }} />}
        </span>
        {step.dots > 0 && <span className="jp-augdot">{'·'.repeat(step.dots)}</span>}
        {step.halves > 0 && (
          <span className="jp-under">
            {Array.from({ length: step.halves }, (_, i) => <i key={i} />)}
          </span>
        )}
      </span>
      {step.art.gliss && (
        <span className="jp-gliss" title="glissando">
          ⤳<Digit spec={step.art.gliss} />
        </span>
      )}
      {Array.from({ length: step.extend }, (_, i) => (
        <span key={i} className="jp-dash">–</span>
      ))}
    </>
  )
}

function BarView({ style }: { style: string }) {
  if (style === 'repeat-start') return <span className="jp-bar repeat">‖:</span>
  if (style === 'repeat-end') return <span className="jp-bar repeat">:‖</span>
  if (style === 'double') return <span className="jp-bar">‖</span>
  return <span className="jp-bar">|</span>
}

function ScoreView({
  items, ctx, current,
}: { items: Item[]; ctx: ResolveContext; current: number }) {
  if (!items.length) {
    return <p className="jp-empty">Type some numbers above to see them here.</p>
  }
  return (
    <div className="jianpu">
      {items.map((item, i) =>
        item.kind === 'bar'
          ? <BarView key={i} style={item.style} />
          : <StepView key={i} step={item.step} ctx={ctx} playing={item.step.id === current} />,
      )}
    </div>
  )
}

// ------------------------------------------------------------------- panel

export default function Notation({ tuning, musicKey, onStrike, onRequestKey, livePlay }: NotationProps) {
  const [text, setText] = useState(() => exampleSource(EXAMPLES[0]))
  const [tempo, setTempo] = useState(DEFAULT_TEMPO)
  const [loop, setLoop] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(-1)
  const [showHelp, setShowHelp] = useState(false)

  const playerRef = useRef<Player | null>(null)
  const scoreRef = useRef<HTMLDivElement>(null)
  const lastMetaTempo = useRef<number | null>(null)

  if (playerRef.current === null) playerRef.current = new Player()

  const score = useMemo(() => parseScore(text), [text])
  const scoreKey = score.meta.key ?? musicKey
  const ctx = useMemo(() => makeContext(tuning, scoreKey), [tuning, scoreKey])
  const compiled = useMemo(() => compileScore(score, ctx, tempo), [score, ctx, tempo])

  useEffect(() => {
    const t = score.meta.tempo
    if (t !== null && t !== lastMetaTempo.current) setTempo(t)
    lastMetaTempo.current = t
  }, [score.meta.tempo])

  useEffect(() => () => playerRef.current?.stop(), [])

  // Keep the playhead in view on long scores
  useEffect(() => {
    if (current < 0) return
    scoreRef.current
      ?.querySelector(`[data-step="${current}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [current])

  function stop(): void {
    playerRef.current?.stop()
    setPlaying(false)
    setCurrent(-1)
  }

  function play(): void {
    const player = playerRef.current
    if (!player) return
    player.stop()
    setPlaying(true)
    player.play(compiled, {
      onStrike,
      onStep: setCurrent,
      onEnd: () => { setPlaying(false); setCurrent(-1) },
    }, loop)
  }

  function loadExample(title: string): void {
    const example = EXAMPLES.find((e) => e.title === title)
    if (!example) return
    stop()
    setText(exampleSource(example))
  }

  const totalBeats = score.steps.reduce((sum, s) => sum + s.beats, 0)
  const keyMismatch = score.meta.key !== null && score.meta.key !== musicKey

  // shows notes / chords played in current notation
  const liveSpecs = (livePlay?.strings ?? [])
    .map((i) => tuning[i])
    .filter((n): n is Note => n !== undefined)
    .map((n) => noteToPitchSpec(n, ctx))
    .filter((p): p is PitchSpec => p !== null)

  const liveStep: Step | null = liveSpecs.length
    ? { id: -1, pitches: liveSpecs, art: emptyArticulation(), beats: 1, halves: 0, dots: 0, extend: 0, line: 0, text: '' }
    : null

  const liveText = liveSpecs.length
    ? (() => {
        const ascending = [...liveSpecs].sort((a, b) => pitchHeight(a, ctx) - pitchHeight(b, ctx))
        const parts = ascending.map(pitchSpecToInput)
        return parts.length > 1 ? `[${parts.join(' ')}]` : parts[0]
      })()
    : ''

  return (
    <section className="notation">
      <div className="notation-head">
        <span className="notation-stat">
          {score.steps.length} notes · {totalBeats % 1 === 0 ? totalBeats : totalBeats.toFixed(2)} beats
          {compiled.totalMs > 0 && ` · ${(compiled.totalMs / 1000).toFixed(1)}s`}
        </span>
      </div>

      <div className="live-input" title="What you just played on the strings, in notation">
        <span className="live-input-label">{liveStep ? 'You played' : 'Play a string to see it here'}</span>
        {liveStep && (
          <>
            <span className="jianpu live-input-digits">
              <StepView step={liveStep} ctx={ctx} playing={false} />
            </span>
            <code className="live-input-text">{liveText}</code>
          </>
        )}
      </div>

      <div className="notation-controls">
        <button className="play" onClick={playing ? stop : play} disabled={!score.steps.length}>
          {playing ? '■ Stop' : '▶ Play'}
        </button>

        <label className="tempo">
          <span>♩ = {tempo}</span>
          <input
            type="range" min={30} max={200} value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
          />
        </label>

        <label className="check">
          <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
          Loop
        </label>

        <select className="preset-select" value="" onChange={(e) => loadExample(e.target.value)}>
          <option value="" disabled>Load example…</option>
          {EXAMPLES.map((e) => <option key={e.title} value={e.title}>{e.title}</option>)}
        </select>

        <button onClick={() => setShowHelp((v) => !v)}>
          {showHelp ? 'Hide syntax' : 'Syntax'}
        </button>
      </div>

      {showHelp && <SyntaxHelp />}

      <textarea
        className="notation-input"
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'1=D\n4/4\ntempo=90\n\n1 2 3 5 | 6 1\' 6 5 | 3 2 1 - ||'}
      />

      {score.errors.length > 0 && (
        <ul className="notation-errors">
          {score.errors.map((err, i) => (
            <li key={i}>
              <span className="line">line {err.line}</span>
              <code>{err.text}</code> : {err.message}
            </li>
          ))}
        </ul>
      )}

      {keyMismatch && (
        <p className="notation-note">
          This score is written in <strong>1={score.meta.key}</strong> but the instrument is
          tuned to <strong>{musicKey}</strong>. Notes off the strings are bent into place.
          <button className="link" onClick={() => onRequestKey(score.meta.key!)}>
            Retune to {score.meta.key}
          </button>
        </p>
      )}

      {compiled.offBoard.length > 0 && (
        <p className="notation-note">
          Out of range for this tuning, played as bare tones:{' '}
          <code>{compiled.offBoard.join(', ')}</code>
        </p>
      )}

      <div className="score-view" ref={scoreRef}>
        <ScoreView items={score.items} ctx={ctx} current={current} />
      </div>
    </section>
  )
}

function SyntaxHelp() {
  return (
    <div className="syntax-help">
      <dl>
        <dt><code>1</code>–<code>7</code></dt><dd>scale degrees (do–ti) in the current key</dd>
        <dt><code>0</code></dt><dd>rest</dd>
        <dt><code>#4</code> <code>b7</code></dt><dd>sharpen / flatten, written before the number</dd>
        <dt><code>1'</code> <code>1,</code></dt><dd>octave up / down — jianpu's dots, one mark per octave</dd>
        <dt><code>-</code></dt><dd>hold the previous note one more beat</dd>
        <dt><code>1_</code> <code>1__</code></dt><dd>halve the duration: eighth, sixteenth</dd>
        <dt><code>1.</code></dt><dd>dotted — one and a half times as long</dd>
        <dt><code>[135]</code></dt><dd>chord, rolled slightly like a real hand</dd>
        <dt><code>1~5'</code></dt><dd>glissando (刮奏) sweeping across every string between</dd>
        <dt><code>5*</code></dt><dd>tremolo (摇指), a rapid repeated pluck</dd>
        <dt><code>3^</code></dt><dd>press-bend upward (上滑音)</dd>
        <dt><code>6v</code></dt><dd>vibrato (揉弦)</dd>
        <dt><code>1&gt;</code></dt><dd>accent</dd>
        <dt><code>s12</code></dt><dd>string number 12 directly, koto-style</dd>
        <dt><code>|</code> <code>||</code></dt><dd>barline, final barline</dd>
        <dt><code>|:</code> <code>:|x3</code></dt><dd>repeat section, three times through</dd>
        <dt><code>1=D</code></dt><dd>key: the number 1 means D</dd>
        <dt><code>4/4</code> <code>tempo=90</code></dt><dd>time signature, beats per minute</dd>
        <dt><code>//</code></dt><dd>comment to end of line</dd>
      </dl>
      <p>
        Degrees <code>4</code> and <code>7</code> are missing from a pentatonic guzheng, so they
        are produced by bending
      </p>
    </div>
  )
}
