import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { PlaybackSnapshot } from '../audio/playbackEngine'
import {
  barStartAtOrBefore,
  bpmToMicroseconds,
  microsecondsToBpm,
  signatureAtTick,
  tickToMusicalPosition,
} from '../domain/time'
import type { PitchLabelMode } from '../pianoRollPreferences'
import { editorStore, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../state/editorStore'
import { Icon } from './Icon'
import { Divider, ToolButton } from './Ui'

interface TransportBarProps {
  pitchLabelMode: PitchLabelMode
  playback: PlaybackSnapshot
  onPause: () => void
  onPlay: () => void
  onChangeVolume: (volume: number) => void
  onSeek: (tick: number) => void
  onStop: () => void
  onTogglePitchLabelMode: () => void
  onToggleMute: () => void
  volume: number
}

const SNAP_OPTIONS = [
  { value: 1, label: '1/4' },
  { value: 2, label: '1/8' },
  { value: 4, label: '1/16' },
  { value: 8, label: '1/32' },
  { value: 3, label: '1/8 T' },
  { value: 6, label: '1/16 T' },
] as const

export function TransportBar({
  onChangeVolume,
  onPause,
  onPlay,
  onSeek,
  onStop,
  onTogglePitchLabelMode,
  onToggleMute,
  pitchLabelMode,
  playback,
  volume,
}: TransportBarProps) {
  const [volumeOpen, setVolumeOpen] = useState(false)
  const volumeControlRef = useRef<HTMLDivElement>(null)
  const volumeButtonRef = useRef<HTMLButtonElement>(null)
  const document = useStore(editorStore, (state) => state.document)
  const playheadTick = useStore(editorStore, (state) => state.playheadTick)
  const snap = useStore(editorStore, (state) => state.snapStepsPerQuarter)
  const zoom = useStore(editorStore, (state) => state.zoom)
  const loop = useStore(editorStore, (state) => state.loop)
  const selectedTrackId = useStore(editorStore, (state) => state.selectedTrackId)
  const selectedNoteIds = useStore(editorStore, (state) => state.selectedNoteIds)
  const execute = useStore(editorStore, (state) => state.execute)
  const setSnap = useStore(editorStore, (state) => state.setSnap)
  const setZoom = useStore(editorStore, (state) => state.setZoom)
  const setLoop = useStore(editorStore, (state) => state.setLoop)

  useEffect(() => {
    if (!volumeOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!volumeControlRef.current?.contains(event.target as Node)) setVolumeOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setVolumeOpen(false)
      volumeButtonRef.current?.focus()
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [volumeOpen])

  const activeTempo = useMemo(() => {
    if (!document) return undefined
    return [...document.tempoEvents]
      .filter((event) => event.tick <= playheadTick)
      .sort((left, right) => right.tick - left.tick)[0]
  }, [document, playheadTick])

  if (!document) return null
  const position = tickToMusicalPosition(document, playheadTick)
  const signature = signatureAtTick(document, playheadTick)
  const bpm = microsecondsToBpm(activeTempo?.microsecondsPerBeat ?? 500_000)

  const addTempo = () => {
    execute({
      type: 'add-tempo',
      tick: playheadTick,
      microsecondsPerBeat: activeTempo?.microsecondsPerBeat ?? 500_000,
    })
  }

  const addSignature = () => {
    execute({
      type: 'add-signature',
      tick: barStartAtOrBefore(document, playheadTick),
      numerator: signature.numerator,
      denominator: signature.denominator,
    })
  }

  return (
    <section className="transport-bar" aria-label="播放与编辑控制">
      <div className="transport-controls">
        <ToolButton icon="stop" label="停止" onClick={onStop} />
        <button
          aria-label={playback.playing ? '暂停（空格）' : '播放（空格）'}
          className="play-button"
          disabled={playback.starting}
          onClick={playback.playing ? onPause : onPlay}
          type="button"
        >
          <span className={playback.starting ? 'spinner' : ''}>
            {!playback.starting ? (
              <Icon className="size-4" name={playback.playing ? 'pause' : 'play'} />
            ) : null}
          </span>
        </button>
        <ToolButton
          active={loop.enabled}
          icon="loop"
          label={loop.enabled ? '关闭循环' : '开启循环'}
          onClick={() => setLoop({ ...loop, enabled: !loop.enabled })}
        />
        <div className="volume-control" ref={volumeControlRef}>
          <ToolButton
            active={volumeOpen}
            aria-expanded={volumeOpen}
            aria-haspopup="dialog"
            icon={volume === 0 ? 'volume-off' : volume < 50 ? 'volume-low' : 'volume-on'}
            label={volume === 0 ? '播放总音量：已静音' : `播放总音量：${volume}%`}
            onClick={() => setVolumeOpen((open) => !open)}
            ref={volumeButtonRef}
          />
          {volumeOpen ? (
            <div
              aria-label="播放音量设置"
              aria-modal="false"
              className="volume-popover"
              role="dialog"
            >
              <div className="volume-popover-heading">
                <strong>播放音量</strong>
                <span>{volume}%</span>
              </div>
              <input
                aria-label="播放音量"
                max="100"
                min="0"
                onChange={(event) => onChangeVolume(Number(event.currentTarget.value))}
                step="1"
                type="range"
                value={volume}
              />
              <button className="volume-mute-button" onClick={onToggleMute} type="button">
                <Icon name={volume === 0 ? 'volume-on' : 'volume-off'} />
                {volume === 0 ? '恢复音量' : '静音'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <Divider />

      <button className="position-display" onClick={() => onSeek(0)} title="回到开头" type="button">
        <span>小节 · 拍 · Tick</span>
        <strong>{position.label}</strong>
      </button>

      <div className="transport-field tempo-field">
        <span>BPM</span>
        <input
          aria-label="当前速度"
          max="999"
          min="1"
          onChange={(event) => {
            if (!activeTempo) return
            execute({
              type: 'update-tempo',
              id: activeTempo.id,
              changes: {
                microsecondsPerBeat: bpmToMicroseconds(Number(event.currentTarget.value)),
              },
            })
          }}
          type="number"
          value={Number(bpm.toFixed(2))}
        />
      </div>

      <div className="transport-readout">
        <span>拍号</span>
        <strong>
          {signature.numerator}/{signature.denominator}
        </strong>
      </div>

      <Divider />

      <label className="transport-field snap-field">
        <span>吸附</span>
        <select onChange={(event) => setSnap(Number(event.currentTarget.value))} value={snap}>
          {SNAP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <ToolButton
        disabled={!selectedTrackId || selectedNoteIds.length === 0}
        label="量化所选音符起点"
        onClick={() => {
          if (!selectedTrackId) return
          execute({
            type: 'quantize-notes',
            trackId: selectedTrackId,
            noteIds: selectedNoteIds,
            stepsPerQuarter: snap,
          })
        }}
      >
        <span>量化</span>
      </ToolButton>

      <Divider />

      <ToolButton compact icon="zoom-out" label="缩小" onClick={() => setZoom(zoom - ZOOM_STEP)} />
      <input
        aria-label="水平缩放"
        className="zoom-slider"
        max={MAX_ZOOM}
        min={MIN_ZOOM}
        onChange={(event) => setZoom(Number(event.currentTarget.value))}
        step={ZOOM_STEP}
        type="range"
        value={zoom}
      />
      <ToolButton compact icon="zoom-in" label="放大" onClick={() => setZoom(zoom + ZOOM_STEP)} />
      <ToolButton
        active={pitchLabelMode === 'all'}
        aria-pressed={pitchLabelMode === 'all'}
        className="pitch-label-toggle"
        label={pitchLabelMode === 'all' ? '仅显示 C 音高标签' : '显示全部音高标签'}
        onClick={onTogglePitchLabelMode}
      >
        <span>音名：{pitchLabelMode === 'all' ? '全部' : 'C'}</span>
      </ToolButton>

      <div className="ml-auto flex items-center gap-1.5">
        <ToolButton label="在播放头添加速度事件" onClick={addTempo}>
          <span>+ 速度</span>
        </ToolButton>
        <ToolButton label="在播放头添加拍号事件" onClick={addSignature}>
          <span>+ 拍号</span>
        </ToolButton>
      </div>
    </section>
  )
}
