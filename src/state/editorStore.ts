import { applyPatches, enablePatches, type Patch, produceWithPatches } from 'immer'
import { createStore } from 'zustand/vanilla'
import { applyEditorCommand, type EditorCommand, EditorCommandError } from '../domain/commands'
import { createBlankDocument } from '../domain/defaultDocument'
import type {
  DecodeWarning,
  LoopRange,
  MidiDocument,
  SessionSnapshot,
  TrackRoute,
} from '../domain/types'

enablePatches()

interface HistoryEntry {
  patches: Patch[]
  inversePatches: Patch[]
}

export interface EditorState {
  document: MidiDocument | null
  warnings: DecodeWarning[]
  routes: Record<string, TrackRoute>
  mutedTrackIds: string[]
  soloTrackIds: string[]
  selectedTrackId: string | null
  selectedNoteIds: string[]
  snapStepsPerQuarter: number
  zoom: number
  playheadTick: number
  loop: LoopRange
  dirty: boolean
  persistenceError: boolean
  statusMessage: string | null
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  execute: (command: EditorCommand) => boolean
  undo: () => void
  redo: () => void
  newDocument: () => void
  replaceDocument: (document: MidiDocument, warnings?: DecodeWarning[]) => void
  restoreSession: (snapshot: SessionSnapshot) => void
  markClean: () => void
  selectTrack: (trackId: string) => void
  setSelectedNoteIds: (noteIds: string[]) => void
  selectNote: (noteId: string, additive: boolean) => void
  setSnap: (stepsPerQuarter: number) => void
  setZoom: (zoom: number) => void
  setPlayhead: (tick: number) => void
  setLoop: (loop: LoopRange) => void
  setTrackRoute: (trackId: string, route: TrackRoute) => void
  toggleMute: (trackId: string) => void
  toggleSolo: (trackId: string) => void
  setPersistenceError: (failed: boolean) => void
  setStatus: (message: string | null) => void
  clearWarnings: () => void
}

function initialRoutes(document: MidiDocument): Record<string, TrackRoute> {
  return Object.fromEntries(
    document.tracks
      .filter((track) => track.kind === 'music')
      .map((track) => [track.id, { kind: 'internal' } satisfies TrackRoute]),
  )
}

function defaultLoop(document: MidiDocument): LoopRange {
  return { enabled: false, startTick: 0, endTick: document.ppq * 16 }
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((candidate) => candidate !== id) : [...ids, id]
}

export const editorStore = createStore<EditorState>((set, get) => ({
  document: null,
  warnings: [],
  routes: {},
  mutedTrackIds: [],
  soloTrackIds: [],
  selectedTrackId: null,
  selectedNoteIds: [],
  snapStepsPerQuarter: 4,
  zoom: 1,
  playheadTick: 0,
  loop: { enabled: false, startTick: 0, endTick: 1920 },
  dirty: false,
  persistenceError: false,
  statusMessage: null,
  undoStack: [],
  redoStack: [],

  execute: (command) => {
    const state = get()
    if (!state.document) return false
    try {
      const [document, patches, inversePatches] = produceWithPatches(state.document, (draft) =>
        applyEditorCommand(draft, command),
      )
      if (patches.length === 0) return true
      const undoStack = [...state.undoStack, { patches, inversePatches }].slice(-200)
      const noteIds = new Set(
        document.tracks.flatMap((track) => track.notes.map((note) => note.id)),
      )
      set({
        document,
        dirty: true,
        undoStack,
        redoStack: [],
        selectedNoteIds: state.selectedNoteIds.filter((id) => noteIds.has(id)),
        statusMessage: null,
      })
      return true
    } catch (error) {
      const message =
        error instanceof EditorCommandError || error instanceof Error
          ? error.message
          : '无法完成编辑操作'
      set({ statusMessage: message })
      return false
    }
  },

  undo: () => {
    const state = get()
    const entry = state.undoStack.at(-1)
    if (!state.document || !entry) return
    set({
      document: applyPatches(state.document, entry.inversePatches),
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, entry],
      dirty: true,
      selectedNoteIds: [],
      statusMessage: '已撤销',
    })
  },

  redo: () => {
    const state = get()
    const entry = state.redoStack.at(-1)
    if (!state.document || !entry) return
    set({
      document: applyPatches(state.document, entry.patches),
      undoStack: [...state.undoStack, entry].slice(-200),
      redoStack: state.redoStack.slice(0, -1),
      dirty: true,
      selectedNoteIds: [],
      statusMessage: '已重做',
    })
  },

  newDocument: () => {
    const document = createBlankDocument()
    const musicTrack = document.tracks.find((track) => track.kind === 'music')
    set({
      document,
      warnings: [],
      routes: initialRoutes(document),
      mutedTrackIds: [],
      soloTrackIds: [],
      selectedTrackId: musicTrack?.id ?? null,
      selectedNoteIds: [],
      playheadTick: 0,
      loop: defaultLoop(document),
      dirty: true,
      statusMessage: '已创建空白 MIDI',
      undoStack: [],
      redoStack: [],
    })
  },

  replaceDocument: (document, warnings = []) => {
    const musicTrack = document.tracks.find((track) => track.kind === 'music')
    set({
      document,
      warnings,
      routes: initialRoutes(document),
      mutedTrackIds: [],
      soloTrackIds: [],
      selectedTrackId: musicTrack?.id ?? document.tracks[0]?.id ?? null,
      selectedNoteIds: [],
      playheadTick: 0,
      loop: defaultLoop(document),
      dirty: false,
      statusMessage: `已导入 ${document.name}`,
      undoStack: [],
      redoStack: [],
    })
  },

  restoreSession: (snapshot) => {
    const trackIds = new Set(snapshot.document.tracks.map((track) => track.id))
    const fallbackTrack = snapshot.document.tracks.find((track) => track.kind === 'music')
    const selectedTrackId =
      snapshot.selectedTrackId && trackIds.has(snapshot.selectedTrackId)
        ? snapshot.selectedTrackId
        : (fallbackTrack?.id ?? null)
    set({
      document: snapshot.document,
      warnings: [],
      routes: { ...initialRoutes(snapshot.document), ...snapshot.routes },
      mutedTrackIds: snapshot.mutedTrackIds.filter((id) => trackIds.has(id)),
      soloTrackIds: snapshot.soloTrackIds.filter((id) => trackIds.has(id)),
      selectedTrackId,
      selectedNoteIds: [],
      snapStepsPerQuarter: snapshot.snapStepsPerQuarter,
      zoom: snapshot.zoom,
      playheadTick: 0,
      loop: snapshot.loop,
      dirty: snapshot.dirty,
      statusMessage: '已恢复上次会话',
      undoStack: [],
      redoStack: [],
    })
  },

  markClean: () => set({ dirty: false, statusMessage: 'MIDI 已导出' }),
  selectTrack: (trackId) => set({ selectedTrackId: trackId, selectedNoteIds: [] }),
  setSelectedNoteIds: (selectedNoteIds) => set({ selectedNoteIds }),
  selectNote: (noteId, additive) => {
    const selected = get().selectedNoteIds
    set({
      selectedNoteIds: additive ? toggleId(selected, noteId) : [noteId],
    })
  },
  setSnap: (snapStepsPerQuarter) => set({ snapStepsPerQuarter }),
  setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.5, zoom)) }),
  setPlayhead: (playheadTick) => set({ playheadTick: Math.max(0, Math.round(playheadTick)) }),
  setLoop: (loop) =>
    set({
      loop: {
        enabled: loop.enabled,
        startTick: Math.max(0, Math.round(loop.startTick)),
        endTick: Math.max(loop.startTick + 1, Math.round(loop.endTick)),
      },
    }),
  setTrackRoute: (trackId, route) =>
    set((state) => ({ routes: { ...state.routes, [trackId]: route } })),
  toggleMute: (trackId) =>
    set((state) => ({ mutedTrackIds: toggleId(state.mutedTrackIds, trackId) })),
  toggleSolo: (trackId) =>
    set((state) => ({ soloTrackIds: toggleId(state.soloTrackIds, trackId) })),
  setPersistenceError: (persistenceError) => set({ persistenceError }),
  setStatus: (statusMessage) => set({ statusMessage }),
  clearWarnings: () => set({ warnings: [] }),
}))
