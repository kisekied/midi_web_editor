import { createEditorNote } from './commands'
import type { MidiNote } from './types'

interface ClipboardNote {
  channel: number
  durationTicks: number
  offsetTicks: number
  pitch: number
  releaseVelocity: number
  velocity: number
}

export interface NoteClipboard {
  notes: ClipboardNote[]
  spanTicks: number
}

export interface PasteResult {
  endTick: number
  notes: MidiNote[]
  startTick: number
}

function overlaps(left: ClipboardNote, leftStart: number, right: MidiNote): boolean {
  if (left.channel !== right.channel || left.pitch !== right.pitch) return false
  const start = leftStart + left.offsetTicks
  const end = start + left.durationTicks
  return start < right.startTick + right.durationTicks && right.startTick < end
}

function clipboardHasInternalOverlap(clipboard: NoteClipboard): boolean {
  return clipboard.notes.some((left, leftIndex) =>
    clipboard.notes.some((right, rightIndex) => {
      if (rightIndex <= leftIndex || left.channel !== right.channel || left.pitch !== right.pitch) {
        return false
      }
      return (
        left.offsetTicks < right.offsetTicks + right.durationTicks &&
        right.offsetTicks < left.offsetTicks + left.durationTicks
      )
    }),
  )
}

export function createNoteClipboard(notes: readonly MidiNote[]): NoteClipboard | null {
  if (!notes.length) return null
  const startTick = Math.min(...notes.map((note) => note.startTick))
  const copied = notes
    .map((note) => ({
      channel: note.channel,
      durationTicks: note.durationTicks,
      offsetTicks: note.startTick - startTick,
      pitch: note.pitch,
      releaseVelocity: note.releaseVelocity,
      velocity: note.velocity,
    }))
    .sort((left, right) => left.offsetTicks - right.offsetTicks || left.pitch - right.pitch)
  return {
    notes: copied,
    spanTicks: Math.max(...copied.map((note) => note.offsetTicks + note.durationTicks)),
  }
}

export function pasteNotesAtAvailableTick(
  clipboard: NoteClipboard,
  existingNotes: readonly MidiNote[],
  desiredStartTick: number,
  gridTicks: number,
): PasteResult | null {
  if (!clipboard.notes.length || clipboardHasInternalOverlap(clipboard)) return null
  const step = Math.max(1, Math.round(gridTicks))
  let startTick = Math.max(0, Math.round(desiredStartTick))

  for (let attempt = 0; attempt < 4096; attempt += 1) {
    const collision = clipboard.notes.some((note) =>
      existingNotes.some((existing) => overlaps(note, startTick, existing)),
    )
    if (!collision) {
      const notes = clipboard.notes.map((note) => ({
        ...createEditorNote({
          channel: note.channel,
          durationTicks: note.durationTicks,
          pitch: note.pitch,
          startTick: startTick + note.offsetTicks,
          velocity: note.velocity,
        }),
        releaseVelocity: note.releaseVelocity,
      }))
      return { endTick: startTick + clipboard.spanTicks, notes, startTick }
    }
    startTick += step
  }

  return null
}
