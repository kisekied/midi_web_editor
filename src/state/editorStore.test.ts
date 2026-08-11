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

describe('track monitoring state', () => {
  it('clears mute when enabling solo on the same track', () => {
    editorStore.getState().newDocument()
    const trackId = activeTrackId()

    editorStore.getState().toggleMute(trackId)
    expect(editorStore.getState().mutedTrackIds).toContain(trackId)

    editorStore.getState().toggleSolo(trackId)
    expect(editorStore.getState().mutedTrackIds).not.toContain(trackId)
    expect(editorStore.getState().soloTrackIds).toContain(trackId)
  })

  it('keeps mute off when disabling solo', () => {
    editorStore.getState().newDocument()
    const trackId = activeTrackId()

    editorStore.getState().toggleSolo(trackId)
    editorStore.getState().toggleMute(trackId)
    editorStore.getState().toggleSolo(trackId)

    expect(editorStore.getState().mutedTrackIds).not.toContain(trackId)
    expect(editorStore.getState().soloTrackIds).not.toContain(trackId)
  })

  it('moves solo to the newly selected track', () => {
    editorStore.getState().newDocument()
    const firstTrackId = activeTrackId()
    expect(editorStore.getState().execute({ type: 'add-track', convertType0: false })).toBe(true)
    const secondTrackId = editorStore
      .getState()
      .document?.tracks.find((track) => track.kind === 'music' && track.id !== firstTrackId)?.id
    if (!secondTrackId) throw new Error('missing second music track')

    editorStore.getState().toggleSolo(firstTrackId)
    editorStore.getState().toggleSolo(secondTrackId)

    expect(editorStore.getState().soloTrackIds).toEqual([secondTrackId])
  })
})

describe('editor zoom', () => {
  it('allows zooming out to a quarter scale and clamps values to the supported range', () => {
    editorStore.getState().setZoom(0)
    expect(editorStore.getState().zoom).toBe(0.25)

    editorStore.getState().setZoom(5)
    expect(editorStore.getState().zoom).toBe(4)

    editorStore.getState().setZoom(1)
  })
})
