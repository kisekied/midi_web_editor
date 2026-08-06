import { describe, expect, it } from 'vitest'
import { createEditorNote } from './commands'
import { createNoteClipboard, pasteNotesAtAvailableTick } from './noteClipboard'

function note(startTick: number, pitch: number, durationTicks = 120) {
  return createEditorNote({ channel: 0, durationTicks, pitch, startTick, velocity: 96 })
}

describe('note clipboard', () => {
  it('copies one note and pastes it at the requested tick', () => {
    const clipboard = createNoteClipboard([note(480, 60)])
    expect(clipboard).not.toBeNull()
    if (!clipboard) return

    const result = pasteNotesAtAvailableTick(clipboard, [], 960, 120)
    expect(result?.notes).toHaveLength(1)
    expect(result?.notes[0]).toMatchObject({ startTick: 960, pitch: 60, velocity: 96 })
  })

  it('preserves the relative timing of multiple copied notes', () => {
    const clipboard = createNoteClipboard([note(480, 60), note(720, 64, 240)])
    expect(clipboard).not.toBeNull()
    if (!clipboard) return

    const result = pasteNotesAtAvailableTick(clipboard, [], 1200, 120)
    expect(
      result?.notes.map(({ startTick, pitch, durationTicks }) => ({
        startTick,
        pitch,
        durationTicks,
      })),
    ).toEqual([
      { startTick: 1200, pitch: 60, durationTicks: 120 },
      { startTick: 1440, pitch: 64, durationTicks: 240 },
    ])
    expect(result?.endTick).toBe(1680)
  })

  it('advances by the grid until the pasted notes no longer overlap', () => {
    const existing = [note(0, 60, 480)]
    const clipboard = createNoteClipboard(existing)
    expect(clipboard).not.toBeNull()
    if (!clipboard) return

    const result = pasteNotesAtAvailableTick(clipboard, existing, 0, 120)
    expect(result?.startTick).toBe(480)
    expect(result?.notes[0]?.startTick).toBe(480)
  })
})
