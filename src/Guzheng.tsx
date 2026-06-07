import { useRef, useState, useEffect, type PointerEvent } from 'react'
import { pluck, preloadSamples, type Voice } from './audio.ts'
import type { Note } from './notes.ts'

interface GuzhengProps {
  tuning: Note[]
  markedNote: string | null
}

const BRIDGE_FRACTION = 0.28
const MAX_BEND = 2
const BEND_RANGE_PX = 200

function letterOf(note: Note): string {
  return /^([A-G][#b]?)/.exec(note)?.[1] ?? ''
}

type BendSource = 'key' | 'bridge'

export default function Guzheng({ tuning, markedNote }: GuzhengProps) {
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

  const lastVoice = useRef<Map<number, Voice>>(new Map())
  const bend = useRef<{
    voice: Voice
    index: number
    anchorY: number
    source: BendSource
  } | null>(null)

  const [active, setActive] = useState(-1)
  const [bending, setBending] = useState(false)

  function highlight(index: number): void {
    setActive(index)
    setTimeout(() => setActive((cur) => (cur === index ? -1 : cur)), 180)
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
        return (
          <div
            key={i}
            data-string={i}
            className={
              'string' +
              (isMarked(note, i) ? ' marked' : '') +
              (active === i ? ' active' : '')
            }
            title={note}
          >
            <span className="wire" />
            <span className="label">{note}</span>
          </div>
        )
      })}
    </div>
  )
}
