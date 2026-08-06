import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useStore } from 'zustand'
import { createEditorNote } from '../domain/commands'
import { documentEndTick, snapTick, tickToMusicalPosition } from '../domain/time'
import type { MidiDocument, MidiNote } from '../domain/types'
import type { PitchLabelMode } from '../pianoRollPreferences'
import { editorStore } from '../state/editorStore'
import type { Theme } from '../theme'
import { TimelineHeader } from './TimelineHeader'

const ROW_HEIGHT = 20
const TOTAL_HEIGHT = ROW_HEIGHT * 128
const KEY_WIDTH = 74
const MIDDLE_C_PITCH = 60

interface ViewportState {
  width: number
  height: number
  scrollLeft: number
  scrollTop: number
}

interface SelectionBox {
  left: number
  top: number
  width: number
  height: number
}

interface DragState {
  mode: 'move' | 'resize'
  clientX: number
  clientY: number
  notes: MidiNote[]
}

function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12)
}

function midiNoteName(pitch: number): string {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`
}

function noteTop(pitch: number): number {
  return (127 - pitch) * ROW_HEIGHT
}

export function pitchGridLineKind(pitchBelowLine: number): 'middle-c' | 'octave' | 'row' {
  const pitchAboveLine = pitchBelowLine + 1
  if (pitchAboveLine === MIDDLE_C_PITCH) return 'middle-c'
  if (pitchAboveLine <= 127 && pitchAboveLine % 12 === 0) return 'octave'
  return 'row'
}

function GridCanvas({
  document,
  pixelsPerTick,
  snapStepsPerQuarter,
  theme,
  viewport,
}: {
  document: MidiDocument
  pixelsPerTick: number
  snapStepsPerQuarter: number
  theme: Theme
  viewport: ViewportState
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || viewport.width <= 0 || viewport.height <= 0) return
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    canvas.width = Math.round(viewport.width * ratio)
    canvas.height = Math.round(viewport.height * ratio)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)
    const colors =
      theme === 'light'
        ? {
            background: '#f8f9fc',
            blackKeyRow: 'rgba(30, 41, 59, 0.025)',
            bar: '#aeb5c2',
            beat: '#cfd4dd',
            middleCLine: 'rgba(109, 72, 204, 0.38)',
            middleCRow: 'rgba(139, 92, 246, 0.08)',
            octave: '#c8ced8',
            row: '#e6e9ef',
            subdivision: '#e1e4ea',
          }
        : {
            background: '#0c0f15',
            blackKeyRow: 'rgba(255,255,255,0.018)',
            bar: '#454c5c',
            beat: '#2b303d',
            middleCLine: 'rgba(167, 139, 250, 0.45)',
            middleCRow: 'rgba(139, 92, 246, 0.09)',
            octave: '#282d39',
            row: '#191d26',
            subdivision: '#1b1f28',
          }
    context.fillStyle = colors.background
    context.fillRect(0, 0, viewport.width, viewport.height)

    const firstPitch = Math.min(127, 127 - Math.floor(viewport.scrollTop / ROW_HEIGHT))
    const lastPitch = Math.max(
      0,
      127 - Math.ceil((viewport.scrollTop + viewport.height) / ROW_HEIGHT),
    )
    for (let pitch = firstPitch; pitch >= lastPitch; pitch -= 1) {
      const y = noteTop(pitch) - viewport.scrollTop
      const lineKind = pitchGridLineKind(pitch)
      if (isBlackKey(pitch)) {
        context.fillStyle = colors.blackKeyRow
        context.fillRect(0, y, viewport.width, ROW_HEIGHT)
      }
      if (pitch === MIDDLE_C_PITCH) {
        context.fillStyle = colors.middleCRow
        context.fillRect(0, y, viewport.width, ROW_HEIGHT)
      }
      context.strokeStyle =
        lineKind === 'middle-c'
          ? colors.middleCLine
          : lineKind === 'octave'
            ? colors.octave
            : colors.row
      context.lineWidth = lineKind === 'middle-c' ? 1.5 : lineKind === 'octave' ? 1 : 0.5
      context.beginPath()
      context.moveTo(0, Math.round(y) + 0.5)
      context.lineTo(viewport.width, Math.round(y) + 0.5)
      context.stroke()
    }

    const stepTicks = document.ppq / snapStepsPerQuarter
    const startTick = Math.max(0, viewport.scrollLeft / pixelsPerTick)
    const endTick = (viewport.scrollLeft + viewport.width) / pixelsPerTick
    let tick = Math.floor(startTick / stepTicks) * stepTicks
    let guard = 0
    while (tick <= endTick && guard < 4096) {
      const x = tick * pixelsPerTick - viewport.scrollLeft
      const beatRatio = tick / document.ppq
      const onBeat = Math.abs(beatRatio - Math.round(beatRatio)) < 0.001
      const position = onBeat ? tickToMusicalPosition(document, Math.round(tick)) : null
      const onBar = position?.beat === 1 && position.tick === 0
      context.strokeStyle = onBar ? colors.bar : onBeat ? colors.beat : colors.subdivision
      context.lineWidth = onBar ? 1.3 : onBeat ? 1 : 0.5
      context.beginPath()
      context.moveTo(Math.round(x) + 0.5, 0)
      context.lineTo(Math.round(x) + 0.5, viewport.height)
      context.stroke()
      tick += stepTicks
      guard += 1
    }
  }, [document, pixelsPerTick, snapStepsPerQuarter, theme, viewport])

  return (
    <canvas
      className="grid-canvas"
      ref={canvasRef}
      style={{ left: viewport.scrollLeft, top: viewport.scrollTop }}
    />
  )
}

function VelocityLane({
  contentWidth,
  pixelsPerTick,
  scrollLeft,
  viewportWidth,
}: {
  contentWidth: number
  pixelsPerTick: number
  scrollLeft: number
  viewportWidth: number
}) {
  const document = useStore(editorStore, (state) => state.document)
  const selectedTrackId = useStore(editorStore, (state) => state.selectedTrackId)
  const selectedNoteIds = useStore(editorStore, (state) => state.selectedNoteIds)
  const execute = useStore(editorStore, (state) => state.execute)
  const [preview, setPreview] = useState<{ id: string; velocity: number } | null>(null)
  const laneRef = useRef<HTMLDivElement>(null)

  if (!document) return null
  const track = document.tracks.find((candidate) => candidate.id === selectedTrackId)
  if (!track) return null
  const visibleStart = scrollLeft / pixelsPerTick
  const visibleEnd = (scrollLeft + viewportWidth) / pixelsPerTick
  const visibleNotes = track.notes.filter(
    (note) => note.startTick + note.durationTicks >= visibleStart && note.startTick <= visibleEnd,
  )
  const firstSelected = track.notes.find((note) => selectedNoteIds.includes(note.id))

  const startVelocityDrag = (event: ReactPointerEvent, note: MidiNote) => {
    event.stopPropagation()
    const updateFromClientY = (clientY: number) => {
      const rect = laneRef.current?.getBoundingClientRect()
      if (!rect) return note.velocity
      return Math.min(127, Math.max(1, Math.round(((rect.bottom - clientY) / rect.height) * 127)))
    }
    setPreview({ id: note.id, velocity: updateFromClientY(event.clientY) })
    const onMove = (moveEvent: PointerEvent) => {
      setPreview({ id: note.id, velocity: updateFromClientY(moveEvent.clientY) })
    }
    const onUp = (upEvent: PointerEvent) => {
      const velocity = updateFromClientY(upEvent.clientY)
      execute({
        type: 'update-notes',
        trackId: track.id,
        updates: [{ id: note.id, changes: { velocity } }],
      })
      setPreview(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="velocity-lane-shell">
      <div className="velocity-label">
        <span>VELOCITY</span>
        <small>1—127</small>
      </div>
      <div className="velocity-viewport" ref={laneRef} style={{ width: viewportWidth }}>
        <div
          className="velocity-content"
          style={{ width: contentWidth, transform: `translateX(${-scrollLeft}px)` }}
        >
          {visibleNotes.map((note) => {
            const velocity = preview?.id === note.id ? preview.velocity : note.velocity
            return (
              <button
                aria-label={`${midiNoteName(note.pitch)} 力度 ${velocity}`}
                className={`velocity-bar ${selectedNoteIds.includes(note.id) ? 'is-selected' : ''}`}
                key={note.id}
                onPointerDown={(event) => startVelocityDrag(event, note)}
                style={{
                  height: `${Math.max(4, (velocity / 127) * 70)}px`,
                  left: note.startTick * pixelsPerTick,
                  width: Math.max(4, Math.min(12, note.durationTicks * pixelsPerTick)),
                }}
                title={`力度 ${velocity}`}
                type="button"
              />
            )
          })}
        </div>
        {firstSelected ? (
          <div className="note-inspector">
            <strong>{midiNoteName(firstSelected.pitch)}</strong>
            <label>
              Tick
              <input
                min="0"
                onChange={(event) =>
                  execute({
                    type: 'update-notes',
                    trackId: track.id,
                    updates: [
                      {
                        id: firstSelected.id,
                        changes: { startTick: Number(event.currentTarget.value) },
                      },
                    ],
                  })
                }
                type="number"
                value={firstSelected.startTick}
              />
            </label>
            <label>
              时值
              <input
                min="1"
                onChange={(event) =>
                  execute({
                    type: 'update-notes',
                    trackId: track.id,
                    updates: [
                      {
                        id: firstSelected.id,
                        changes: { durationTicks: Number(event.currentTarget.value) },
                      },
                    ],
                  })
                }
                type="number"
                value={firstSelected.durationTicks}
              />
            </label>
            <label>
              力度
              <input
                max="127"
                min="1"
                onChange={(event) =>
                  execute({
                    type: 'update-notes',
                    trackId: track.id,
                    updates: [
                      {
                        id: firstSelected.id,
                        changes: { velocity: Number(event.currentTarget.value) },
                      },
                    ],
                  })
                }
                type="number"
                value={firstSelected.velocity}
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function PianoRoll({
  isPlaying,
  onScrub,
  onScrubEnd,
  onScrubStart,
  pitchLabelMode,
  theme,
}: {
  isPlaying: boolean
  onScrub: (tick: number) => void
  onScrubEnd: (tick: number) => void
  onScrubStart: () => void
  pitchLabelMode: PitchLabelMode
  theme: Theme
}) {
  const document = useStore(editorStore, (state) => state.document)
  const selectedTrackId = useStore(editorStore, (state) => state.selectedTrackId)
  const selectedNoteIds = useStore(editorStore, (state) => state.selectedNoteIds)
  const snapStepsPerQuarter = useStore(editorStore, (state) => state.snapStepsPerQuarter)
  const zoom = useStore(editorStore, (state) => state.zoom)
  const playheadTick = useStore(editorStore, (state) => state.playheadTick)
  const loop = useStore(editorStore, (state) => state.loop)
  const execute = useStore(editorStore, (state) => state.execute)
  const selectNote = useStore(editorStore, (state) => state.selectNote)
  const setSelectedNoteIds = useStore(editorStore, (state) => state.setSelectedNoteIds)
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialScrollDone = useRef(false)
  const [viewport, setViewport] = useState<ViewportState>({
    width: 0,
    height: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [previewUpdates, setPreviewUpdates] = useState<Map<string, Partial<MidiNote>>>(new Map())

  const pixelsPerTick = 0.2 * zoom
  const contentWidth = document
    ? Math.max(viewport.width, (documentEndTick(document) + document.ppq * 8) * pixelsPerTick)
    : viewport.width

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const updateSize = () =>
      setViewport((current) => {
        if (!initialScrollDone.current && element.clientHeight > 0) {
          element.scrollTop = noteTop(72) - element.clientHeight / 2
          initialScrollDone.current = true
        }
        return {
          ...current,
          width: element.clientWidth,
          height: element.clientHeight,
          scrollTop: element.scrollTop,
        }
      })
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    updateSize()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isPlaying) return
    const element = scrollRef.current
    if (!element || element.clientWidth <= 0) return
    const playheadLeft = playheadTick * pixelsPerTick
    const followMargin = Math.min(200, Math.max(80, element.clientWidth * 0.2))
    const visibleLeft = element.scrollLeft
    const visibleRight = visibleLeft + element.clientWidth
    let nextScrollLeft: number | null = null

    if (playheadLeft > visibleRight - followMargin) {
      nextScrollLeft = playheadLeft - element.clientWidth + followMargin
    } else if (playheadLeft < visibleLeft) {
      nextScrollLeft = playheadLeft - followMargin
    }

    if (nextScrollLeft !== null) {
      element.scrollLeft = Math.max(0, Math.round(nextScrollLeft))
    }
  }, [isPlaying, pixelsPerTick, playheadTick])

  const selectedTrack = document?.tracks.find((track) => track.id === selectedTrackId)
  const visiblePitchMax = Math.min(127, 127 - Math.floor(viewport.scrollTop / ROW_HEIGHT) + 2)
  const visiblePitchMin = Math.max(
    0,
    127 - Math.ceil((viewport.scrollTop + viewport.height) / ROW_HEIGHT) - 2,
  )
  const visibleStartTick = Math.max(0, viewport.scrollLeft / pixelsPerTick - 1)
  const visibleEndTick = (viewport.scrollLeft + viewport.width) / pixelsPerTick + 1

  const visibleNotes = useMemo(() => {
    if (!document) return []
    return document.tracks.flatMap((track) =>
      track.notes
        .filter(
          (note) =>
            note.pitch <= visiblePitchMax &&
            note.pitch >= visiblePitchMin &&
            note.startTick + note.durationTicks >= visibleStartTick &&
            note.startTick <= visibleEndTick,
        )
        .map((note) => ({ track, note })),
    )
  }, [document, visibleEndTick, visiblePitchMax, visiblePitchMin, visibleStartTick])

  const updateViewportFromScroll = useCallback(() => {
    const element = scrollRef.current
    if (!element) return
    setViewport({
      width: element.clientWidth,
      height: element.clientHeight,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    })
  }, [])

  if (!document || !selectedTrack) return null

  const absolutePoint = (clientX: number, clientY: number) => {
    const rect = scrollRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: clientX - rect.left + viewport.scrollLeft,
      y: clientY - rect.top + viewport.scrollTop,
    }
  }

  const playheadTickAtPointer = (clientX: number) => {
    const rect = scrollRef.current?.getBoundingClientRect()
    if (!rect) return playheadTick
    const tick = (clientX - rect.left + viewport.scrollLeft) / pixelsPerTick
    return snapTick(tick, document.ppq, snapStepsPerQuarter)
  }

  const beginPlayheadDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onScrubStart()
    let tick = playheadTickAtPointer(event.clientX)
    onScrub(tick)

    const removeListeners = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onMove = (moveEvent: PointerEvent) => {
      tick = playheadTickAtPointer(moveEvent.clientX)
      onScrub(tick)
    }
    const finish = () => {
      removeListeners()
      onScrubEnd(tick)
    }
    const onUp = (upEvent: PointerEvent) => {
      tick = playheadTickAtPointer(upEvent.clientX)
      finish()
    }
    const onCancel = () => finish()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  const movePlayheadFromKeyboard = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    const step = Math.max(1, Math.round(document.ppq / snapStepsPerQuarter))
    const tick = Math.max(0, playheadTick + (event.key === 'ArrowLeft' ? -step : step))
    onScrubStart()
    onScrub(tick)
    onScrubEnd(tick)
  }

  const beginNoteDrag = (event: ReactPointerEvent, note: MidiNote, mode: DragState['mode']) => {
    event.stopPropagation()
    const additive = event.shiftKey || event.metaKey || event.ctrlKey
    const dragIds = selectedNoteIds.includes(note.id) ? selectedNoteIds : [note.id]
    selectNote(note.id, additive)
    const originals = selectedTrack.notes
      .filter((candidate) => dragIds.includes(candidate.id))
      .map((candidate) => ({ ...candidate }))
    const drag: DragState = {
      mode,
      clientX: event.clientX,
      clientY: event.clientY,
      notes: originals,
    }

    const calculate = (clientX: number, clientY: number) => {
      const deltaTicksRaw = (clientX - drag.clientX) / pixelsPerTick
      const deltaPitch = -Math.round((clientY - drag.clientY) / ROW_HEIGHT)
      const updates = new Map<string, Partial<MidiNote>>()
      for (const original of drag.notes) {
        if (drag.mode === 'resize') {
          const durationTicks = Math.max(
            1,
            snapTick(original.durationTicks + deltaTicksRaw, document.ppq, snapStepsPerQuarter),
          )
          updates.set(original.id, { durationTicks })
        } else {
          const startTick = snapTick(
            original.startTick + deltaTicksRaw,
            document.ppq,
            snapStepsPerQuarter,
          )
          const pitch = Math.min(127, Math.max(0, original.pitch + deltaPitch))
          updates.set(original.id, { startTick, pitch })
        }
      }
      return updates
    }

    const onMove = (moveEvent: PointerEvent) => {
      setPreviewUpdates(calculate(moveEvent.clientX, moveEvent.clientY))
    }
    const onUp = (upEvent: PointerEvent) => {
      const updates = calculate(upEvent.clientX, upEvent.clientY)
      execute({
        type: 'update-notes',
        trackId: selectedTrack.id,
        updates: [...updates.entries()].map(([id, changes]) => ({ id, changes })),
      })
      setPreviewUpdates(new Map())
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const beginBoxSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.midi-note')) return
    const start = absolutePoint(event.clientX, event.clientY)
    setSelectedNoteIds([])
    const onMove = (moveEvent: PointerEvent) => {
      const current = absolutePoint(moveEvent.clientX, moveEvent.clientY)
      setSelectionBox({
        left: Math.min(start.x, current.x),
        top: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      })
    }
    const onUp = (upEvent: PointerEvent) => {
      const current = absolutePoint(upEvent.clientX, upEvent.clientY)
      const box = {
        left: Math.min(start.x, current.x),
        top: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      }
      if (box.width > 3 || box.height > 3) {
        const ids = selectedTrack.notes
          .filter((note) => {
            const left = note.startTick * pixelsPerTick
            const top = noteTop(note.pitch)
            const width = Math.max(3, note.durationTicks * pixelsPerTick)
            return (
              left < box.left + box.width &&
              left + width > box.left &&
              top < box.top + box.height &&
              top + ROW_HEIGHT > box.top
            )
          })
          .map((note) => note.id)
        setSelectedNoteIds(ids)
      }
      setSelectionBox(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const addNoteAtPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.midi-note, .roll-playhead')) return
    const point = absolutePoint(event.clientX, event.clientY)
    const startTick = snapTick(point.x / pixelsPerTick, document.ppq, snapStepsPerQuarter)
    const pitch = Math.min(127, Math.max(0, 127 - Math.floor(point.y / ROW_HEIGHT)))
    const note = createEditorNote({
      startTick,
      durationTicks: Math.max(1, Math.round(document.ppq / snapStepsPerQuarter)),
      pitch,
      velocity: 100,
      channel: selectedTrack.defaultChannel,
    })
    if (execute({ type: 'add-note', trackId: selectedTrack.id, note })) {
      setSelectedNoteIds([note.id])
    }
  }

  return (
    <section className="piano-roll-shell" aria-label="钢琴卷帘编辑器">
      <TimelineHeader
        contentWidth={contentWidth}
        onScrub={onScrub}
        onScrubEnd={onScrubEnd}
        onScrubStart={onScrubStart}
        pixelsPerTick={pixelsPerTick}
        scrollLeft={viewport.scrollLeft}
        viewportWidth={viewport.width}
      />
      <div className="piano-roll-main">
        <div aria-hidden="true" className="piano-keyboard" style={{ width: KEY_WIDTH }}>
          <div style={{ height: TOTAL_HEIGHT, transform: `translateY(${-viewport.scrollTop}px)` }}>
            {Array.from({ length: 128 }, (_, index) => 127 - index).map((pitch) => (
              <div
                className={`piano-key ${isBlackKey(pitch) ? 'is-black' : ''} ${pitch === MIDDLE_C_PITCH ? 'is-middle-c' : ''}`}
                key={pitch}
                style={{ height: ROW_HEIGHT, top: noteTop(pitch) }}
                title={pitch === MIDDLE_C_PITCH ? '中央 C（C4，MIDI 60）' : undefined}
              >
                {pitchLabelMode === 'all' || pitch % 12 === 0 ? (
                  <span className="piano-key-label">
                    {pitch === MIDDLE_C_PITCH ? '中央 C · C4' : midiNoteName(pitch)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="piano-scroll" onScroll={updateViewportFromScroll} ref={scrollRef}>
          {/* biome-ignore lint/a11y/useSemanticElements: The virtualized piano roll follows the ARIA grid interaction pattern. */}
          <div
            aria-label="音符网格"
            className="piano-content"
            onDoubleClick={addNoteAtPointer}
            onPointerDown={beginBoxSelection}
            role="grid"
            style={{ height: TOTAL_HEIGHT, width: contentWidth }}
          >
            <GridCanvas
              document={document}
              pixelsPerTick={pixelsPerTick}
              snapStepsPerQuarter={snapStepsPerQuarter}
              theme={theme}
              viewport={viewport}
            />
            {loop.enabled ? (
              <span
                aria-hidden="true"
                className="roll-loop-region"
                style={{
                  left: loop.startTick * pixelsPerTick,
                  width: Math.max(2, (loop.endTick - loop.startTick) * pixelsPerTick),
                }}
              />
            ) : null}
            {visibleNotes.map(({ track, note }) => {
              const changes = previewUpdates.get(note.id)
              const display = changes ? { ...note, ...changes } : note
              const active = track.id === selectedTrack.id
              const selected = active && selectedNoteIds.includes(note.id)
              return (
                <button
                  aria-label={`${track.name} ${midiNoteName(display.pitch)}，tick ${display.startTick}，时值 ${display.durationTicks}，力度 ${display.velocity}`}
                  aria-pressed={selected}
                  className={`midi-note ${active ? 'is-active-track' : 'is-ghost'} ${selected ? 'is-selected' : ''} ${note.importedOverlap ? 'has-overlap' : ''}`}
                  key={`${track.id}:${note.id}`}
                  onPointerDown={(event) => {
                    if (active) beginNoteDrag(event, note, 'move')
                  }}
                  style={{
                    height: ROW_HEIGHT - 3,
                    left: display.startTick * pixelsPerTick,
                    top: noteTop(display.pitch) + 1,
                    width: Math.max(4, display.durationTicks * pixelsPerTick),
                  }}
                  tabIndex={active && selected ? 0 : -1}
                  title={`${midiNoteName(display.pitch)} · V${display.velocity}${note.importedOverlap ? ' · 导入重叠' : ''}`}
                  type="button"
                >
                  {display.durationTicks * pixelsPerTick > 34 ? (
                    <span>{midiNoteName(display.pitch)}</span>
                  ) : null}
                  {active ? (
                    <i
                      aria-hidden="true"
                      className="note-resize-handle"
                      onPointerDown={(event) => beginNoteDrag(event, note, 'resize')}
                    />
                  ) : null}
                </button>
              )
            })}
            {selectionBox ? (
              <span aria-hidden="true" className="selection-box" style={selectionBox} />
            ) : null}
            <span
              aria-label="播放头；拖动定位"
              aria-orientation="horizontal"
              aria-valuemax={Math.round(contentWidth / pixelsPerTick)}
              aria-valuemin={0}
              aria-valuenow={playheadTick}
              className="roll-playhead"
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={movePlayheadFromKeyboard}
              onPointerDown={beginPlayheadDrag}
              role="slider"
              style={{ left: playheadTick * pixelsPerTick }}
              tabIndex={0}
              title="拖动定位播放头"
            />
          </div>
        </div>
      </div>
      <VelocityLane
        contentWidth={contentWidth}
        pixelsPerTick={pixelsPerTick}
        scrollLeft={viewport.scrollLeft}
        viewportWidth={viewport.width}
      />
    </section>
  )
}
