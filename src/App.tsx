import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import { type PlaybackSnapshot, playbackEngine } from './audio/playbackEngine'
import { webMidiManager } from './audio/webMidi'
import { UnsavedDialog, WarningDialog } from './components/Dialogs'
import { PianoRoll } from './components/PianoRoll'
import { TopBar } from './components/TopBar'
import { TrackSidebar } from './components/TrackSidebar'
import { TransportBar } from './components/TransportBar'
import { WelcomeScreen } from './components/WelcomeScreen'
import {
  createNoteClipboard,
  type NoteClipboard,
  pasteNotesAtAvailableTick,
} from './domain/noteClipboard'
import { snapTick } from './domain/time'
import type { MidiOutputDevice } from './domain/types'
import { MidiCodecClient } from './midi/codecClient'
import {
  getInitialPitchLabelMode,
  type PitchLabelMode,
  storePitchLabelMode,
} from './pianoRollPreferences'
import { editorStore } from './state/editorStore'
import { sessionRepository } from './state/sessionRepository'
import { applyTheme, getInitialTheme, getStoredTheme, storeTheme, type Theme } from './theme'

interface PendingAction {
  run: () => void | Promise<void>
}

const INITIAL_PLAYBACK: PlaybackSnapshot = { playing: false, starting: false, error: null }

function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || '未命名作品'
  return cleaned.toLowerCase().endsWith('.mid') ? cleaned : `${cleaned}.mid`
}

function isTextInput(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export default function App() {
  const document = useStore(editorStore, (state) => state.document)
  const warnings = useStore(editorStore, (state) => state.warnings)
  const statusMessage = useStore(editorStore, (state) => state.statusMessage)
  const persistenceError = useStore(editorStore, (state) => state.persistenceError)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [fileBusy, setFileBusy] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [playback, setPlayback] = useState<PlaybackSnapshot>(INITIAL_PLAYBACK)
  const [devices, setDevices] = useState<MidiOutputDevice[]>([])
  const [noteClipboard, setNoteClipboard] = useState<NoteClipboard | null>(null)
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [themeIsExplicit, setThemeIsExplicit] = useState(() => getStoredTheme() !== null)
  const [pitchLabelMode, setPitchLabelMode] = useState<PitchLabelMode>(getInitialPitchLabelMode)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const codecRef = useRef<MidiCodecClient | null>(null)
  const resumeAfterScrubRef = useRef(false)
  if (!codecRef.current) codecRef.current = new MidiCodecClient()

  useEffect(() => applyTheme(theme), [theme])

  useEffect(() => {
    if (themeIsExplicit) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setTheme(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [themeIsExplicit])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      storeTheme(next)
      return next
    })
    setThemeIsExplicit(true)
  }, [])

  const togglePitchLabelMode = useCallback(() => {
    setPitchLabelMode((current) => {
      const next = current === 'all' ? 'c-only' : 'all'
      storePitchLabelMode(next)
      return next
    })
  }, [])

  const beginPlayheadScrub = useCallback(() => {
    resumeAfterScrubRef.current = playbackEngine.state.playing
    if (resumeAfterScrubRef.current) playbackEngine.pause()
  }, [])

  const scrubPlayhead = useCallback((tick: number) => {
    editorStore.getState().setPlayhead(tick)
  }, [])

  const endPlayheadScrub = useCallback((tick: number) => {
    editorStore.getState().setPlayhead(tick)
    const shouldResume = resumeAfterScrubRef.current
    resumeAfterScrubRef.current = false
    if (shouldResume) void playbackEngine.play()
  }, [])

  useEffect(() => {
    let cancelled = false
    sessionRepository
      .loadLatest()
      .then((snapshot) => {
        if (!cancelled && snapshot?.version === 1) editorStore.getState().restoreSession(snapshot)
      })
      .catch(() => editorStore.getState().setStatus('无法读取上次本地会话'))
      .finally(() => {
        if (!cancelled) setSessionLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => playbackEngine.subscribe(setPlayback), [])
  useEffect(() => webMidiManager.subscribe(setDevices), [])

  useEffect(() => {
    if (!playback.error) return
    editorStore.getState().setStatus(playback.error)
  }, [playback.error])

  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => editorStore.getState().setStatus(null), 4200)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!editorStore.getState().dirty || !editorStore.getState().persistenceError) return
      event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  const exportMidi = useCallback(async (): Promise<boolean> => {
    const state = editorStore.getState()
    if (!state.document || !codecRef.current) return false
    setFileBusy(true)
    try {
      const bytes = await codecRef.current.encode(state.document)
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/midi' })
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = safeFileName(state.document.name)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      state.markClean()
      return true
    } catch (error) {
      state.setStatus(error instanceof Error ? error.message : '导出 MIDI 失败')
      return false
    } finally {
      setFileBusy(false)
    }
  }, [])

  const importFile = useCallback(async (file: File) => {
    if (!codecRef.current) return
    setFileBusy(true)
    try {
      const bytes = await file.arrayBuffer()
      const result = await codecRef.current.decode(bytes, file.name)
      playbackEngine.stop()
      editorStore.getState().replaceDocument(result.document, result.warnings)
    } catch (error) {
      editorStore.getState().setStatus(error instanceof Error ? error.message : '导入 MIDI 失败')
    } finally {
      setFileBusy(false)
    }
  }, [])

  const runReplacingAction = useCallback((run: PendingAction['run']) => {
    if (editorStore.getState().dirty) setPendingAction({ run })
    else void run()
  }, [])

  const requestNew = useCallback(() => {
    runReplacingAction(() => {
      playbackEngine.stop()
      editorStore.getState().newDocument()
    })
  }, [runReplacingAction])

  const requestFileImport = useCallback(() => fileInputRef.current?.click(), [])

  const connectMidi = useCallback(async () => {
    try {
      const outputs = await webMidiManager.connect()
      editorStore
        .getState()
        .setStatus(
          outputs.length
            ? `已找到 ${outputs.length} 个 MIDI 输出`
            : '已授权，但没有发现 MIDI 输出设备',
        )
    } catch (error) {
      editorStore
        .getState()
        .setStatus(error instanceof Error ? error.message : '无法连接 MIDI 设备')
    }
  }, [])

  const copySelection = useCallback(() => {
    const state = editorStore.getState()
    const track = state.document?.tracks.find((candidate) => candidate.id === state.selectedTrackId)
    const notes = track?.notes.filter((note) => state.selectedNoteIds.includes(note.id)) ?? []
    const nextClipboard = createNoteClipboard(notes)
    if (!nextClipboard) {
      state.setStatus('请先选择一个或多个音符')
      return
    }
    setNoteClipboard(nextClipboard)
    state.setLastEditEndTick(Math.max(...notes.map((note) => note.startTick + note.durationTicks)))
    state.setStatus(`已复制 ${nextClipboard.notes.length} 个音符`)
  }, [])

  const pasteSelection = useCallback(() => {
    const state = editorStore.getState()
    const activeDocument = state.document
    const track = activeDocument?.tracks.find((candidate) => candidate.id === state.selectedTrackId)
    if (!noteClipboard) {
      state.setStatus('剪贴板中没有音符')
      return
    }
    if (!activeDocument || !track || track.kind !== 'music') return
    const gridTicks = Math.max(1, Math.round(activeDocument.ppq / state.snapStepsPerQuarter))
    const desiredStartTick =
      state.lastEditEndTick ??
      snapTick(state.playheadTick, activeDocument.ppq, state.snapStepsPerQuarter)
    const paste = pasteNotesAtAvailableTick(noteClipboard, track.notes, desiredStartTick, gridTicks)
    if (!paste) {
      state.setStatus('无法在当前轨道找到不重叠的粘贴位置')
      return
    }
    if (!state.execute({ type: 'add-notes', trackId: track.id, notes: paste.notes })) return
    state.setSelectedNoteIds(paste.notes.map((note) => note.id))
    state.setStatus(
      `已粘贴 ${paste.notes.length} 个音符到 tick ${paste.startTick}；下次将紧跟在 tick ${paste.endTick}`,
    )
  }, [noteClipboard])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = editorStore.getState()
      const activeDocument = state.document
      if (!activeDocument) return
      const commandKey = event.metaKey || event.ctrlKey

      if (commandKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void exportMidi()
        return
      }
      if (isTextInput(event.target)) return

      if (event.code === 'Space') {
        event.preventDefault()
        if (playbackEngine.state.playing) playbackEngine.pause()
        else void playbackEngine.play()
        return
      }
      if (commandKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (commandKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        const track = activeDocument.tracks.find(
          (candidate) => candidate.id === state.selectedTrackId,
        )
        state.setSelectedNoteIds(track?.notes.map((note) => note.id) ?? [])
        return
      }
      if (commandKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelection()
        return
      }
      if (commandKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteSelection()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedTrackId) {
        event.preventDefault()
        state.execute({
          type: 'delete-notes',
          trackId: state.selectedTrackId,
          noteIds: state.selectedNoteIds,
        })
        state.setSelectedNoteIds([])
        return
      }
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) &&
        state.selectedTrackId
      ) {
        const track = activeDocument.tracks.find(
          (candidate) => candidate.id === state.selectedTrackId,
        )
        const selected =
          track?.notes.filter((note) => state.selectedNoteIds.includes(note.id)) ?? []
        if (!selected.length) return
        event.preventDefault()
        const grid = Math.max(1, Math.round(activeDocument.ppq / state.snapStepsPerQuarter))
        const horizontal = event.key === 'ArrowLeft' ? -grid : event.key === 'ArrowRight' ? grid : 0
        const vertical =
          event.key === 'ArrowUp'
            ? event.shiftKey
              ? 12
              : 1
            : event.key === 'ArrowDown'
              ? event.shiftKey
                ? -12
                : -1
              : 0
        state.execute({
          type: 'update-notes',
          trackId: state.selectedTrackId,
          updates: selected.map((note) => ({
            id: note.id,
            changes: {
              startTick: Math.max(0, note.startTick + horizontal),
              pitch: Math.min(127, Math.max(0, note.pitch + vertical)),
            },
          })),
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copySelection, exportMidi, pasteSelection])

  const handleFile = (file: File | undefined) => {
    if (!file) return
    runReplacingAction(() => importFile(file))
  }

  return (
    <section
      aria-label="织音 MIDI 编辑器"
      className="app-root"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        handleFile(event.dataTransfer.files[0])
      }}
    >
      <input
        accept=".mid,.midi,audio/midi,audio/x-midi"
        className="sr-only"
        onChange={(event) => {
          handleFile(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
        ref={fileInputRef}
        type="file"
      />

      {!document ? (
        <WelcomeScreen
          loading={sessionLoading || fileBusy}
          onImport={requestFileImport}
          onNew={requestNew}
          onToggleTheme={toggleTheme}
          theme={theme}
        />
      ) : (
        <main className="editor-app">
          <TopBar
            canPaste={Boolean(noteClipboard)}
            devices={devices}
            midiConnected={webMidiManager.connected}
            midiSupported={webMidiManager.supported}
            onConnectMidi={connectMidi}
            onCopy={copySelection}
            onExport={() => void exportMidi()}
            onImport={requestFileImport}
            onNew={requestNew}
            onPaste={pasteSelection}
            onToggleTheme={toggleTheme}
            theme={theme}
          />
          <TransportBar
            onTogglePitchLabelMode={togglePitchLabelMode}
            onPause={() => playbackEngine.pause()}
            onPlay={() => void playbackEngine.play()}
            onSeek={(tick) => playbackEngine.seek(tick)}
            onStop={() => playbackEngine.stop()}
            pitchLabelMode={pitchLabelMode}
            playback={playback}
          />
          <div className="editor-workspace">
            <TrackSidebar
              devices={devices}
              midiConnected={webMidiManager.connected}
              midiSupported={webMidiManager.supported}
              onConnectMidi={connectMidi}
            />
            <PianoRoll
              isPlaying={playback.playing}
              onScrub={scrubPlayhead}
              onScrubEnd={endPlayheadScrub}
              onScrubStart={beginPlayheadScrub}
              pitchLabelMode={pitchLabelMode}
              theme={theme}
            />
          </div>
        </main>
      )}

      {fileBusy && document ? (
        <div className="busy-overlay" role="status">
          <span className="spinner" />
          正在处理 MIDI…
        </div>
      ) : null}
      {statusMessage ? (
        <div
          aria-live="polite"
          className={`status-toast ${persistenceError ? 'is-error' : ''}`}
          role="status"
        >
          {statusMessage}
        </div>
      ) : null}
      <WarningDialog warnings={warnings} onClose={() => editorStore.getState().clearWarnings()} />
      {pendingAction ? (
        <UnsavedDialog
          onCancel={() => setPendingAction(null)}
          onDiscard={() => {
            const action = pendingAction
            setPendingAction(null)
            void action.run()
          }}
          onExport={() => {
            const action = pendingAction
            void exportMidi().then((success) => {
              if (!success) return
              setPendingAction(null)
              void action.run()
            })
          }}
        />
      ) : null}
    </section>
  )
}
