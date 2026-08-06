import { type PointerEvent as ReactPointerEvent, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import {
  barStartAtOrBefore,
  bpmToMicroseconds,
  microsecondsToBpm,
  snapTick,
  ticksPerMeasure,
} from '../domain/time'
import { editorStore } from '../state/editorStore'
import { Icon } from './Icon'

type SelectedMarker = { kind: 'tempo' | 'signature'; id: string }

interface TimelineHeaderProps {
  contentWidth: number
  onScrub: (tick: number) => void
  onScrubEnd: (tick: number) => void
  onScrubStart: () => void
  pixelsPerTick: number
  scrollLeft: number
  viewportWidth: number
}

export function TimelineHeader({
  contentWidth,
  onScrub,
  onScrubEnd,
  onScrubStart,
  pixelsPerTick,
  scrollLeft,
  viewportWidth,
}: TimelineHeaderProps) {
  const document = useStore(editorStore, (state) => state.document)
  const playheadTick = useStore(editorStore, (state) => state.playheadTick)
  const snap = useStore(editorStore, (state) => state.snapStepsPerQuarter)
  const loop = useStore(editorStore, (state) => state.loop)
  const execute = useStore(editorStore, (state) => state.execute)
  const setLoop = useStore(editorStore, (state) => state.setLoop)
  const [selected, setSelected] = useState<SelectedMarker | null>(null)

  const bars = useMemo(() => {
    if (!document) return []
    const firstTick = Math.max(0, Math.floor(scrollLeft / pixelsPerTick) - document.ppq * 4)
    const lastTick = Math.ceil((scrollLeft + viewportWidth) / pixelsPerTick) + document.ppq * 4
    const result: Array<{ tick: number; bar: number }> = []
    let tick = barStartAtOrBefore(document, firstTick)
    let guard = 0
    while (tick <= lastTick && guard < 512) {
      const signature = document.timeSignatureEvents
        .filter((event) => event.tick <= tick)
        .sort((left, right) => right.tick - left.tick)[0]
      const measureTicks = signature ? ticksPerMeasure(document, signature) : document.ppq * 4
      const bar = result.length
        ? (result.at(-1)?.bar ?? 0) + 1
        : Math.max(1, Math.floor(tick / Math.max(1, measureTicks)) + 1)
      result.push({ tick, bar })
      tick += measureTicks
      guard += 1
    }
    return result
  }, [document, pixelsPerTick, scrollLeft, viewportWidth])

  if (!document) return null

  const selectedEvent = selected
    ? selected.kind === 'tempo'
      ? document.tempoEvents.find((event) => event.id === selected.id)
      : document.timeSignatureEvents.find((event) => event.id === selected.id)
    : undefined

  const markerLeft = selectedEvent ? selectedEvent.tick * pixelsPerTick - scrollLeft : 0
  const popoverLeft = Math.min(Math.max(12, markerLeft), Math.max(12, viewportWidth - 250))

  const pointerToTick = (clientX: number, target: HTMLElement): number => {
    const rect = target.getBoundingClientRect()
    return snapTick((clientX - rect.left) / pixelsPerTick, document.ppq, snap)
  }

  const beginRulerScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const target = event.currentTarget
    onScrubStart()
    let tick = pointerToTick(event.clientX, target)
    onScrub(tick)

    const removeListeners = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    const onMove = (moveEvent: PointerEvent) => {
      tick = pointerToTick(moveEvent.clientX, target)
      onScrub(tick)
    }
    const finish = () => {
      removeListeners()
      onScrubEnd(tick)
    }
    const onUp = (upEvent: PointerEvent) => {
      tick = pointerToTick(upEvent.clientX, target)
      finish()
    }
    const onCancel = () => finish()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  return (
    <div className="timeline-header">
      <div className="timeline-label-column">
        <span>TEMPO</span>
        <span>METER</span>
        <span>BAR</span>
      </div>
      <div className="timeline-viewport" style={{ width: viewportWidth }}>
        <div
          className="timeline-content"
          style={{ width: contentWidth, transform: `translateX(${-scrollLeft}px)` }}
        >
          <div className="tempo-marker-row">
            {document.tempoEvents.map((event) => (
              <button
                aria-label={`速度 ${microsecondsToBpm(event.microsecondsPerBeat).toFixed(1)} BPM，tick ${event.tick}`}
                className={`timeline-marker tempo-marker ${selected?.kind === 'tempo' && selected.id === event.id ? 'is-selected' : ''}`}
                key={event.id}
                onClick={() => setSelected({ kind: 'tempo', id: event.id })}
                style={{ left: event.tick * pixelsPerTick }}
                title="点击编辑速度事件"
                type="button"
              >
                <i />
                <span>{microsecondsToBpm(event.microsecondsPerBeat).toFixed(0)}</span>
              </button>
            ))}
          </div>
          <div className="signature-marker-row">
            {document.timeSignatureEvents.map((event) => (
              <button
                aria-label={`拍号 ${event.numerator}/${event.denominator}，tick ${event.tick}`}
                className={`timeline-marker signature-marker ${selected?.kind === 'signature' && selected.id === event.id ? 'is-selected' : ''}`}
                key={event.id}
                onClick={() => setSelected({ kind: 'signature', id: event.id })}
                style={{ left: event.tick * pixelsPerTick }}
                title="点击编辑拍号事件"
                type="button"
              >
                <i />
                <span>
                  {event.numerator}/{event.denominator}
                </span>
              </button>
            ))}
          </div>
          <div
            aria-label="时间标尺；点击或拖动定位，Shift 拖动设置循环区"
            className="ruler-row"
            onPointerDown={(event) => {
              if (!event.shiftKey) {
                beginRulerScrub(event)
                return
              }
              const startTick = pointerToTick(event.clientX, event.currentTarget)
              const target = event.currentTarget
              const onUp = (upEvent: PointerEvent) => {
                const endTick = pointerToTick(upEvent.clientX, target)
                setLoop({
                  enabled: true,
                  startTick: Math.min(startTick, endTick),
                  endTick: Math.max(startTick + 1, endTick),
                })
                window.removeEventListener('pointerup', onUp)
              }
              window.addEventListener('pointerup', onUp)
            }}
            role="slider"
            aria-valuemax={Math.round(contentWidth / pixelsPerTick)}
            aria-valuemin={0}
            aria-valuenow={playheadTick}
            tabIndex={0}
          >
            {bars.map((bar) => (
              <span
                className="bar-tick"
                key={`${bar.tick}:${bar.bar}`}
                style={{ left: bar.tick * pixelsPerTick }}
              >
                {bar.bar}
              </span>
            ))}
            {loop.enabled ? (
              <span
                className="loop-strip"
                style={{
                  left: loop.startTick * pixelsPerTick,
                  width: Math.max(2, (loop.endTick - loop.startTick) * pixelsPerTick),
                }}
              />
            ) : null}
            <span className="ruler-playhead" style={{ left: playheadTick * pixelsPerTick }} />
          </div>
        </div>

        {selected && selectedEvent ? (
          <form
            className="marker-popover"
            onSubmit={(event) => {
              event.preventDefault()
              setSelected(null)
            }}
            style={{ left: popoverLeft }}
          >
            <div className="marker-popover-title">
              <strong>{selected.kind === 'tempo' ? '速度事件' : '拍号事件'}</strong>
              <button aria-label="关闭事件编辑" onClick={() => setSelected(null)} type="button">
                <Icon className="size-3.5" name="close" />
              </button>
            </div>
            <label>
              Tick
              <input
                min="0"
                onChange={(event) => {
                  const tick = Number(event.currentTarget.value)
                  if (selected.kind === 'tempo') {
                    execute({ type: 'update-tempo', id: selected.id, changes: { tick } })
                  } else {
                    execute({
                      type: 'update-signature',
                      id: selected.id,
                      changes: { tick: barStartAtOrBefore(document, tick) },
                    })
                  }
                }}
                type="number"
                value={selectedEvent.tick}
              />
            </label>
            {selected.kind === 'tempo' ? (
              <label>
                BPM
                <input
                  max="999"
                  min="1"
                  onChange={(event) =>
                    execute({
                      type: 'update-tempo',
                      id: selected.id,
                      changes: {
                        microsecondsPerBeat: bpmToMicroseconds(Number(event.currentTarget.value)),
                      },
                    })
                  }
                  step="0.1"
                  type="number"
                  value={Number(
                    microsecondsToBpm(
                      'microsecondsPerBeat' in selectedEvent
                        ? selectedEvent.microsecondsPerBeat
                        : 500_000,
                    ).toFixed(2),
                  )}
                />
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <label>
                  分子
                  <input
                    max="32"
                    min="1"
                    onChange={(event) =>
                      execute({
                        type: 'update-signature',
                        id: selected.id,
                        changes: { numerator: Number(event.currentTarget.value) },
                      })
                    }
                    type="number"
                    value={'numerator' in selectedEvent ? selectedEvent.numerator : 4}
                  />
                </label>
                <label>
                  分母
                  <select
                    onChange={(event) =>
                      execute({
                        type: 'update-signature',
                        id: selected.id,
                        changes: { denominator: Number(event.currentTarget.value) },
                      })
                    }
                    value={'denominator' in selectedEvent ? selectedEvent.denominator : 4}
                  >
                    {[1, 2, 4, 8, 16, 32, 64, 128].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <button
              className="delete-marker-button"
              disabled={selectedEvent.tick === 0}
              onClick={() => {
                execute({
                  type: selected.kind === 'tempo' ? 'delete-tempo' : 'delete-signature',
                  id: selected.id,
                })
                setSelected(null)
              }}
              type="button"
            >
              <Icon className="size-3.5" name="trash" />
              删除事件
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
