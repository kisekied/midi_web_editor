import { describe, expect, it } from 'vitest'
import { createEditorNote } from '../domain/commands'
import { editorStore } from './editorStore'

function activeTrackId(): string {
  const state = editorStore.getState()
  const track = state.document?.tracks.find((candidate) => candidate.kind === 'music')
  if (!track) throw new Error('missing music track')
  return track.id
}

describe('editor last edit position', () => {
  it('tracks the end of the most recently edited notes independently from the playhead', () => {
    editorStore.getState().newDocument()
    const trackId = activeTrackId()
    const note = createEditorNote({ startTick: 230, durationTicks: 95, pitch: 60 })

    expect(editorStore.getState().execute({ type: 'add-note', trackId, note })).toBe(true)
    expect(editorStore.getState().lastEditEndTick).toBe(325)

    editorStore.getState().setPlayhead(1920)
    expect(editorStore.getState().lastEditEndTick).toBe(325)

    expect(
      editorStore.getState().execute({
        type: 'update-notes',
        trackId,
        updates: [{ id: note.id, changes: { startTick: 480, durationTicks: 240 } }],
      }),
    ).toBe(true)
    expect(editorStore.getState().lastEditEndTick).toBe(720)
  })

  it('retains the edited range when its notes are deleted', () => {
    editorStore.getState().newDocument()
    const trackId = activeTrackId()
    const first = createEditorNote({ startTick: 0, durationTicks: 120, pitch: 60 })
    const last = createEditorNote({ startTick: 360, durationTicks: 240, pitch: 64 })
    expect(
      editorStore.getState().execute({ type: 'add-notes', trackId, notes: [first, last] }),
    ).toBe(true)

    expect(
      editorStore
        .getState()
        .execute({ type: 'delete-notes', trackId, noteIds: [first.id, last.id] }),
    ).toBe(true)
    expect(editorStore.getState().lastEditEndTick).toBe(600)
  })
})
