import { useState } from 'react'
import Guzheng from './Guzheng.tsx'
import { TUNINGS, DEFAULT_TUNING } from './tuning.ts'
import { ALL_NOTES, type Note } from './notes.ts'

export default function App() {
  const [tuning, setTuning] = useState<Note[]>(DEFAULT_TUNING)
  const [editing, setEditing] = useState(false)

  function setString(index: number, note: Note): void {
    setTuning((t) => t.map((n, i) => (i === index ? note : n)))
  }

  function applyPreset(label: string): void {
    const preset = TUNINGS.find((t) => t.label === label)
    if (preset) setTuning(preset.notes)
  }

  const markedNote = TUNINGS.find((t) => t.notes.join() === tuning.join())?.markedNote ?? null

  return (
    <div className="app">
      <header>
        <h1>Guzheng</h1>
        <p className="hint">
          Hold Q and move the cursor away from a string to bend its pitch upward — while Q is held, the other strings won't pluck.
        </p>
        <div className="controls">
          <select
            className="preset-select"
            onChange={(e) => applyPreset(e.target.value)}
            value={TUNINGS.find((t) => t.notes.join() === tuning.join())?.label ?? ''}
          >
            <option value="" disabled>Preset tunings</option>
            {TUNINGS.map((t) => (
              <option key={t.label} value={t.label}>{t.label}</option>
            ))}
          </select>
          <button onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done tuning' : 'Tune strings'}
          </button>
          {editing && (
            <button className="reset" onClick={() => setTuning(DEFAULT_TUNING)}>
              Reset to default
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
                {ALL_NOTES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      <Guzheng tuning={tuning} markedNote={markedNote} />
    </div>
  )
}
