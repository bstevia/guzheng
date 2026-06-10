import { useState } from 'react'
import Guzheng from './Guzheng.tsx'
import {
  SCALES, KEYS, DEFAULT_KEY, DEFAULT_SCALE, DEFAULT_TUNING,
  buildTuning, markedNoteForKey, type Scale,
} from './tuning.ts'
import { ALL_NOTES, type Note } from './notes.ts'

export default function App() {
  const [key, setKey] = useState<string>(DEFAULT_KEY)
  const [scale, setScale] = useState<Scale>(DEFAULT_SCALE)
  const [tuning, setTuning] = useState<Note[]>(DEFAULT_TUNING)
  const [editing, setEditing] = useState(false)

  function handleKeyChange(newKey: string): void {
    setKey(newKey)
    setTuning(buildTuning(newKey, scale))
  }

  function handleScaleChange(newLabel: string): void {
    const newScale = SCALES.find((s) => s.label === newLabel) ?? DEFAULT_SCALE
    setScale(newScale)
    setTuning(buildTuning(key, newScale))
  }

  function setString(index: number, note: Note): void {
    setTuning((t) => t.map((n, i) => (i === index ? note : n)))
  }

  return (
    <div className="app">
      <header>
        <h1>Guzheng</h1>
        <p className="hint">
          Drag vertically across the strings to play. Hold <kbd>Q</kbd> or pluck behind the bridge to bend
        </p>
        <div className="controls">
          <select className="preset-select" value={key} onChange={(e) => handleKeyChange(e.target.value)}>
            {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="preset-select" value={scale.label} onChange={(e) => handleScaleChange(e.target.value)}>
            {SCALES.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
          </select>
          <button onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done tuning' : 'Tune strings'}
          </button>
          {editing && (
            <button className="reset" onClick={() => setTuning(buildTuning(key, scale))}>
              Reset
            </button>
          )}
        </div>
      </header>

      {editing && (
        <div className="tuner">
          {tuning.map((note, i) => (
            <label key={i}>
              <span>#{i + 1}</span>
              <select value={note} onChange={(e) => setString(i, e.target.value)}>
                {ALL_NOTES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}

      <Guzheng tuning={tuning} markedNote={markedNoteForKey(key, scale)} />
    </div>
  )
}
