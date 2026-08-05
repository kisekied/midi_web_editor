import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { applyEditorCommand, createEditorNote, EditorCommandError } from './commands'
import { createBlankDocument } from './defaultDocument'

describe('editor commands', () => {
  it('adds and edits notes as one domain operation', () => {
    const document = createBlankDocument()
    const track = document.tracks.find((candidate) => candidate.kind === 'music')
    if (!track) throw new Error('missing music track')
    const note = createEditorNote({ startTick: 0, durationTicks: 120, pitch: 60 })
    const next = produce(document, (draft) => {
      applyEditorCommand(draft, { type: 'add-note', trackId: track.id, note })
      applyEditorCommand(draft, {
        type: 'update-notes',
        trackId: track.id,
        updates: [{ id: note.id, changes: { pitch: 64, velocity: 90 } }],
      })
    })

    expect(next.tracks.find((candidate) => candidate.id === track.id)?.notes[0]).toMatchObject({
      pitch: 64,
      velocity: 90,
      durationTicks: 120,
    })
  })

  it('rejects new same-key overlap', () => {
    const document = createBlankDocument()
    const track = document.tracks.find((candidate) => candidate.kind === 'music')
    if (!track) throw new Error('missing music track')
    track.notes.push(createEditorNote({ startTick: 0, durationTicks: 240, pitch: 60 }))

    expect(() =>
      produce(document, (draft) => {
        applyEditorCommand(draft, {
          type: 'add-note',
          trackId: track.id,
          note: createEditorNote({ startTick: 120, durationTicks: 240, pitch: 60 }),
        })
      }),
    ).toThrowError(EditorCommandError)
  })

  it('requires explicit Type 0 conversion before adding a physical track', () => {
    const document = createBlankDocument()
    document.format = 0
    document.tracks = [document.tracks[1]].filter((track) => track !== undefined)

    expect(() =>
      produce(document, (draft) => {
        applyEditorCommand(draft, { type: 'add-track', convertType0: false })
      }),
    ).toThrowError(/转换为 Type 1/)

    const converted = produce(document, (draft) => {
      applyEditorCommand(draft, { type: 'add-track', convertType0: true })
    })
    expect(converted.format).toBe(1)
    expect(converted.tracks).toHaveLength(2)
  })
})
