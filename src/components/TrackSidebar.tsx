import type { CSSProperties } from 'react'
import { useStore } from 'zustand'
import { GM_PROGRAMS } from '../domain/gmPrograms'
import type { MidiOutputDevice, TrackRoute } from '../domain/types'
import { editorStore } from '../state/editorStore'
import { Icon } from './Icon'
import { Badge, ToolButton } from './Ui'

interface TrackSidebarProps {
  devices: MidiOutputDevice[]
  midiSupported: boolean
  midiConnected: boolean
  onConnectMidi: () => void
}

const MIDI_CHANNELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const

function routeValue(route: TrackRoute | undefined): string {
  if (!route || route.kind === 'internal') return 'internal'
  return `midi:${route.portId}`
}

export function TrackSidebar({
  devices,
  midiSupported,
  midiConnected,
  onConnectMidi,
}: TrackSidebarProps) {
  const document = useStore(editorStore, (state) => state.document)
  const selectedTrackId = useStore(editorStore, (state) => state.selectedTrackId)
  const routes = useStore(editorStore, (state) => state.routes)
  const muted = useStore(editorStore, (state) => state.mutedTrackIds)
  const solo = useStore(editorStore, (state) => state.soloTrackIds)
  const execute = useStore(editorStore, (state) => state.execute)
  const selectTrack = useStore(editorStore, (state) => state.selectTrack)
  const setTrackRoute = useStore(editorStore, (state) => state.setTrackRoute)
  const toggleMute = useStore(editorStore, (state) => state.toggleMute)
  const toggleSolo = useStore(editorStore, (state) => state.toggleSolo)

  if (!document) return null
  const musicTracks = document.tracks.filter((track) => track.kind === 'music')
  const selectedTrack = document.tracks.find((track) => track.id === selectedTrackId)

  const addTrack = () => {
    let convertType0 = false
    if (document.format === 0) {
      convertType0 = window.confirm(
        'SMF Type 0 只能包含一条物理轨道。新增轨道会将文件转换为 Type 1，是否继续？',
      )
      if (!convertType0) return
    }
    if (execute({ type: 'add-track', convertType0 })) {
      const added = editorStore.getState().document?.tracks.at(-1)
      if (added) selectTrack(added.id)
    }
  }

  const deleteTrack = (trackId: string) => {
    const track = document.tracks.find((candidate) => candidate.id === trackId)
    if (!track) return
    const detail = track.passthroughEvents.length
      ? `该轨道还包含 ${track.passthroughEvents.length} 个未显示的 MIDI 事件，删除会一并移除。`
      : '该轨道的所有音符都会被删除。'
    if (!window.confirm(`${detail}\n\n确定删除“${track.name}”吗？`)) return
    execute({ type: 'delete-track', trackId })
    const next = editorStore
      .getState()
      .document?.tracks.find((candidate) => candidate.kind === 'music')
    if (next) selectTrack(next.id)
  }

  return (
    <aside className="track-sidebar" aria-label="轨道面板">
      <div className="track-sidebar-heading">
        <div>
          <span className="eyebrow">TRACKS</span>
          <div className="flex items-center gap-2">
            <h2>轨道</h2>
            <Badge tone="neutral">{musicTracks.length}</Badge>
          </div>
        </div>
        <ToolButton icon="add" label="新增轨道" onClick={addTrack} />
      </div>

      <div className="track-list" role="listbox" aria-label="MIDI 轨道">
        {musicTracks.map((track, index) => {
          const active = track.id === selectedTrackId
          const isMuted = muted.includes(track.id)
          const isSolo = solo.includes(track.id)
          const route = routes[track.id]
          const routeDevice =
            route?.kind === 'midi'
              ? devices.find((device) => device.id === route.portId)
              : undefined
          return (
            <div
              aria-selected={active}
              className={`track-card ${active ? 'is-active' : ''}`}
              key={track.id}
              onClick={() => selectTrack(track.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') selectTrack(track.id)
              }}
              role="option"
              tabIndex={active ? 0 : -1}
            >
              <span
                className="track-color"
                style={{ '--track-hue': `${258 + index * 37}` } as CSSProperties}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="track-index">{String(index + 1).padStart(2, '0')}</span>
                  <strong className="truncate">{track.name}</strong>
                </div>
                <div className="track-meta">
                  CH {track.defaultChannel + 1} · {track.notes.length} 音符
                  {route?.kind === 'midi' ? (
                    <span
                      className={
                        routeDevice?.state === 'connected' ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      · {routeDevice?.name ?? '设备离线'}
                    </span>
                  ) : (
                    <span> · 内置</span>
                  )}
                </div>
              </div>
              <div className="track-toggles">
                <button
                  aria-label={`${isMuted ? '取消静音' : '静音'} ${track.name}`}
                  aria-pressed={isMuted}
                  className={`track-toggle is-mute ${isMuted ? 'is-on' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleMute(track.id)
                  }}
                  title={isMuted ? '取消静音' : '静音'}
                  type="button"
                >
                  M
                </button>
                <button
                  aria-label={`${isSolo ? '取消独奏' : '独奏'} ${track.name}`}
                  aria-pressed={isSolo}
                  className={`track-toggle is-solo ${isSolo ? 'is-on' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleSolo(track.id)
                  }}
                  title={isSolo ? '取消独奏' : '独奏'}
                  type="button"
                >
                  S
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {selectedTrack?.kind === 'music' ? (
        <section className="track-inspector" aria-label="轨道属性">
          <div className="inspector-title">
            <span>轨道属性</span>
            <button
              aria-label="删除当前轨道"
              className="danger-icon-button"
              disabled={musicTracks.length <= 1}
              onClick={() => deleteTrack(selectedTrack.id)}
              title="删除轨道"
              type="button"
            >
              <Icon className="size-4" name="trash" />
            </button>
          </div>
          <label className="field-label">
            名称
            <input
              key={`${selectedTrack.id}:${selectedTrack.name}`}
              defaultValue={selectedTrack.name}
              onBlur={(event) =>
                execute({
                  type: 'update-track',
                  trackId: selectedTrack.id,
                  changes: { name: event.currentTarget.value },
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field-label">
              默认通道
              <select
                onChange={(event) =>
                  execute({
                    type: 'update-track',
                    trackId: selectedTrack.id,
                    changes: { defaultChannel: Number(event.currentTarget.value) },
                  })
                }
                value={selectedTrack.defaultChannel}
              >
                {MIDI_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel + 1}
                    {channel === 9 ? ' · 鼓' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              输出
              <select
                onChange={(event) => {
                  const value = event.currentTarget.value
                  const route: TrackRoute = value.startsWith('midi:')
                    ? { kind: 'midi', portId: value.slice(5) }
                    : { kind: 'internal' }
                  setTrackRoute(selectedTrack.id, route)
                }}
                value={routeValue(routes[selectedTrack.id])}
              >
                <option value="internal">内置合成器</option>
                {devices.map((device) => (
                  <option key={device.id} value={`midi:${device.id}`}>
                    {device.name}
                    {device.state === 'disconnected' ? '（离线）' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field-label">
            GM 音色（外接设备）
            <select
              onChange={(event) =>
                execute({
                  type: 'update-track',
                  trackId: selectedTrack.id,
                  changes: { defaultProgram: Number(event.currentTarget.value) },
                })
              }
              value={selectedTrack.defaultProgram}
            >
              {GM_PROGRAMS.map((name, program) => (
                <option key={name} value={program}>
                  {String(program + 1).padStart(3, '0')} · {name}
                </option>
              ))}
            </select>
          </label>
          {!midiConnected ? (
            <button
              className="midi-connect-card"
              disabled={!midiSupported}
              onClick={onConnectMidi}
              type="button"
            >
              <Icon className="size-4" name="midi" />
              <span>{midiSupported ? '连接外接 MIDI 设备' : '当前浏览器不支持 Web MIDI'}</span>
            </button>
          ) : null}
        </section>
      ) : null}
    </aside>
  )
}
