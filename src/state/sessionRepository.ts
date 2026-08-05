import type { SessionSnapshot } from '../domain/types'
import { type EditorState, editorStore } from './editorStore'

const DATABASE_NAME = 'zhiyin-midi-editor'
const STORE_NAME = 'sessions'
const LATEST_KEY = 'latest'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
  })
}

async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = operation(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('本地存储操作失败'))
    })
  } finally {
    database.close()
  }
}

export const sessionRepository = {
  loadLatest(): Promise<SessionSnapshot | undefined> {
    return transaction('readonly', (store) => store.get(LATEST_KEY))
  },
  save(snapshot: SessionSnapshot): Promise<IDBValidKey> {
    return transaction('readwrite', (store) => store.put(snapshot, LATEST_KEY))
  },
  clear(): Promise<undefined> {
    return transaction('readwrite', (store) => store.delete(LATEST_KEY))
  },
}

export function snapshotFromState(state: EditorState): SessionSnapshot | null {
  if (!state.document) return null
  return {
    version: 1,
    document: state.document,
    routes: state.routes,
    mutedTrackIds: state.mutedTrackIds,
    soloTrackIds: state.soloTrackIds,
    selectedTrackId: state.selectedTrackId,
    snapStepsPerQuarter: state.snapStepsPerQuarter,
    zoom: state.zoom,
    loop: state.loop,
    dirty: state.dirty,
    savedAt: Date.now(),
  }
}

export function installSessionAutosave(): () => void {
  let timer: number | undefined
  const unsubscribe = editorStore.subscribe((state, previous) => {
    const relevantChange =
      state.document !== previous.document ||
      state.routes !== previous.routes ||
      state.mutedTrackIds !== previous.mutedTrackIds ||
      state.soloTrackIds !== previous.soloTrackIds ||
      state.selectedTrackId !== previous.selectedTrackId ||
      state.snapStepsPerQuarter !== previous.snapStepsPerQuarter ||
      state.zoom !== previous.zoom ||
      state.loop !== previous.loop ||
      state.dirty !== previous.dirty
    if (!relevantChange) return

    window.clearTimeout(timer)
    timer = window.setTimeout(async () => {
      const snapshot = snapshotFromState(editorStore.getState())
      if (!snapshot) return
      try {
        await sessionRepository.save(snapshot)
        editorStore.getState().setPersistenceError(false)
      } catch {
        editorStore.getState().setPersistenceError(true)
        editorStore.getState().setStatus('自动保存失败，请立即导出 MIDI')
      }
    }, 650)
  })

  return () => {
    window.clearTimeout(timer)
    unsubscribe()
  }
}
