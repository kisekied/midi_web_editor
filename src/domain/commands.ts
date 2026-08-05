import type { Draft } from 'immer'
import { createMusicTrack } from './defaultDocument'
import { createId } from './id'
import { snapTick } from './time'
import type { MidiDocument, MidiNote } from './types'

export type EditorCommand =
  | { type: 'rename-document'; name: string }
  | { type: 'add-track'; convertType0: boolean }
  | { type: 'delete-track'; trackId: string }
  | {
      type: 'update-track'
      trackId: string
      changes: { name?: string; defaultChannel?: number; defaultProgram?: number }
    }
  | { type: 'add-note'; trackId: string; note: MidiNote }
  | { type: 'add-notes'; trackId: string; notes: MidiNote[] }
  | {
      type: 'update-notes'
      trackId: string
      updates: Array<{ id: string; changes: Partial<MidiNote> }>
    }
  | { type: 'delete-notes'; trackId: string; noteIds: string[] }
  | {
      type: 'quantize-notes'
      trackId: string
      noteIds: string[]
      stepsPerQuarter: number
    }
  | { type: 'add-tempo'; tick: number; microsecondsPerBeat: number }
  | {
      type: 'update-tempo'
      id: string
      changes: { tick?: number; microsecondsPerBeat?: number }
    }
  | { type: 'delete-tempo'; id: string }
  | { type: 'add-signature'; tick: number; numerator: number; denominator: number }
  | {
      type: 'update-signature'
      id: string
      changes: { tick?: number; numerator?: number; denominator?: number }
    }
  | { type: 'delete-signature'; id: string }

export class EditorCommandError extends Error {
  constructor(
    readonly code:
      | 'format-conversion-required'
      | 'last-track'
      | 'overlap'
      | 'not-found'
      | 'invalid-value'
      | 'initial-event',
    message: string,
  ) {
    super(message)
    this.name = 'EditorCommandError'
  }
}

function assertIntegerRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new EditorCommandError('invalid-value', `${label} 必须在 ${minimum}–${maximum} 之间`)
  }
}

function assertNote(note: MidiNote): void {
  assertIntegerRange(note.startTick, 0, Number.MAX_SAFE_INTEGER, '起始 tick')
  assertIntegerRange(note.durationTicks, 1, Number.MAX_SAFE_INTEGER, '音符时值')
  assertIntegerRange(note.pitch, 0, 127, '音高')
  assertIntegerRange(note.velocity, 1, 127, '力度')
  assertIntegerRange(note.releaseVelocity, 0, 127, '释放力度')
  assertIntegerRange(note.channel, 0, 15, 'MIDI 通道')
}

function notesOverlap(left: MidiNote, right: MidiNote): boolean {
  if (left.channel !== right.channel || left.pitch !== right.pitch) return false
  const leftEnd = left.startTick + left.durationTicks
  const rightEnd = right.startTick + right.durationTicks
  return left.startTick < rightEnd && right.startTick < leftEnd
}

function assertNoNewOverlap(notes: readonly MidiNote[]): void {
  for (let leftIndex = 0; leftIndex < notes.length; leftIndex += 1) {
    const left = notes[leftIndex]
    if (!left) continue
    for (let rightIndex = leftIndex + 1; rightIndex < notes.length; rightIndex += 1) {
      const right = notes[rightIndex]
      if (!right) continue
      if (left.importedOverlap && right.importedOverlap) continue
      if (notesOverlap(left, right)) {
        throw new EditorCommandError('overlap', '同一轨道、通道和音高不能创建新的重叠音符')
      }
    }
  }
}

function findTrack(document: Draft<MidiDocument>, trackId: string) {
  const track = document.tracks.find((candidate) => candidate.id === trackId)
  if (!track) throw new EditorCommandError('not-found', '找不到轨道')
  return track
}

function globalEventTrackId(document: Draft<MidiDocument>): string {
  const track = document.tracks.find((candidate) => candidate.kind === 'conductor')
  return track?.id ?? document.tracks[0]?.id ?? ''
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0
}

export function createEditorNote(input: {
  startTick: number
  durationTicks: number
  pitch: number
  velocity?: number
  channel?: number
}): MidiNote {
  return {
    id: createId('note'),
    startTick: Math.round(input.startTick),
    durationTicks: Math.max(1, Math.round(input.durationTicks)),
    pitch: Math.round(input.pitch),
    velocity: Math.round(input.velocity ?? 100),
    releaseVelocity: 0,
    channel: Math.round(input.channel ?? 0),
    sourceOnOrder: Number.MAX_SAFE_INTEGER - 2,
    sourceOffOrder: Number.MAX_SAFE_INTEGER - 1,
    importedOverlap: false,
  }
}

export function applyEditorCommand(document: Draft<MidiDocument>, command: EditorCommand): void {
  switch (command.type) {
    case 'rename-document': {
      document.name = command.name.trim() || '未命名作品'
      return
    }
    case 'add-track': {
      if (document.format === 0 && !command.convertType0) {
        throw new EditorCommandError(
          'format-conversion-required',
          'Type 0 文件新增物理轨道前需要转换为 Type 1',
        )
      }
      if (document.format === 0) document.format = 1
      const sourceIndex = document.tracks.length
      document.tracks.push(createMusicTrack(sourceIndex, `轨道 ${sourceIndex}`))
      return
    }
    case 'delete-track': {
      const track = findTrack(document, command.trackId)
      if (track.kind === 'conductor') {
        throw new EditorCommandError('invalid-value', '全局事件轨不能删除')
      }
      const musicTracks = document.tracks.filter((candidate) => candidate.kind === 'music')
      if (musicTracks.length <= 1) {
        throw new EditorCommandError('last-track', '至少需要保留一条音乐轨')
      }
      document.tracks = document.tracks.filter((candidate) => candidate.id !== command.trackId)
      document.tempoEvents = document.tempoEvents.filter(
        (event) => event.trackId !== command.trackId,
      )
      document.timeSignatureEvents = document.timeSignatureEvents.filter(
        (event) => event.trackId !== command.trackId,
      )
      document.tracks.forEach((candidate, index) => {
        candidate.sourceIndex = index
      })
      return
    }
    case 'update-track': {
      const track = findTrack(document, command.trackId)
      if (command.changes.name !== undefined) {
        track.name = command.changes.name.trim() || `轨道 ${track.sourceIndex}`
      }
      if (command.changes.defaultChannel !== undefined) {
        assertIntegerRange(command.changes.defaultChannel, 0, 15, 'MIDI 通道')
        track.defaultChannel = command.changes.defaultChannel
      }
      if (command.changes.defaultProgram !== undefined) {
        assertIntegerRange(command.changes.defaultProgram, 0, 127, 'GM 音色')
        track.defaultProgram = command.changes.defaultProgram
      }
      return
    }
    case 'add-note': {
      const track = findTrack(document, command.trackId)
      assertNote(command.note)
      assertNoNewOverlap([...track.notes, command.note])
      track.notes.push(command.note)
      track.notes.sort(
        (left, right) => left.startTick - right.startTick || left.pitch - right.pitch,
      )
      return
    }
    case 'add-notes': {
      const track = findTrack(document, command.trackId)
      for (const note of command.notes) assertNote(note)
      assertNoNewOverlap([...track.notes, ...command.notes])
      track.notes.push(...command.notes)
      track.notes.sort(
        (left, right) => left.startTick - right.startTick || left.pitch - right.pitch,
      )
      return
    }
    case 'update-notes': {
      const track = findTrack(document, command.trackId)
      const updates = new Map(command.updates.map((update) => [update.id, update.changes]))
      const candidates = track.notes.map((note) => {
        const changes = updates.get(note.id)
        return changes ? ({ ...note, ...changes } as MidiNote) : (note as MidiNote)
      })
      for (const note of candidates) assertNote(note)
      assertNoNewOverlap(candidates)
      track.notes = candidates
      track.notes.sort(
        (left, right) => left.startTick - right.startTick || left.pitch - right.pitch,
      )
      return
    }
    case 'delete-notes': {
      const track = findTrack(document, command.trackId)
      const ids = new Set(command.noteIds)
      track.notes = track.notes.filter((note) => !ids.has(note.id))
      return
    }
    case 'quantize-notes': {
      const track = findTrack(document, command.trackId)
      const ids = new Set(command.noteIds)
      const candidates = track.notes.map((note) =>
        ids.has(note.id)
          ? ({
              ...note,
              startTick: snapTick(note.startTick, document.ppq, command.stepsPerQuarter),
            } as MidiNote)
          : (note as MidiNote),
      )
      assertNoNewOverlap(candidates)
      track.notes = candidates
      track.notes.sort(
        (left, right) => left.startTick - right.startTick || left.pitch - right.pitch,
      )
      return
    }
    case 'add-tempo': {
      assertIntegerRange(command.tick, 0, Number.MAX_SAFE_INTEGER, 'Tempo tick')
      assertIntegerRange(command.microsecondsPerBeat, 1, 0xff_ffff, 'Tempo 值')
      document.tempoEvents.push({
        id: createId('tempo'),
        trackId: globalEventTrackId(document),
        tick: command.tick,
        microsecondsPerBeat: command.microsecondsPerBeat,
        sourceOrder: Number.MAX_SAFE_INTEGER,
        synthetic: false,
      })
      document.tempoEvents.sort((left, right) => left.tick - right.tick)
      return
    }
    case 'update-tempo': {
      const event = document.tempoEvents.find((candidate) => candidate.id === command.id)
      if (!event) throw new EditorCommandError('not-found', '找不到速度事件')
      if (command.changes.tick !== undefined) {
        assertIntegerRange(command.changes.tick, 0, Number.MAX_SAFE_INTEGER, 'Tempo tick')
        event.tick = command.changes.tick
      }
      if (command.changes.microsecondsPerBeat !== undefined) {
        assertIntegerRange(command.changes.microsecondsPerBeat, 1, 0xff_ffff, 'Tempo 值')
        event.microsecondsPerBeat = command.changes.microsecondsPerBeat
      }
      event.synthetic = false
      document.tempoEvents.sort((left, right) => left.tick - right.tick)
      return
    }
    case 'delete-tempo': {
      const event = document.tempoEvents.find((candidate) => candidate.id === command.id)
      if (!event) throw new EditorCommandError('not-found', '找不到速度事件')
      if (event.tick === 0) {
        throw new EditorCommandError('initial-event', '起始速度事件不能删除')
      }
      document.tempoEvents = document.tempoEvents.filter((candidate) => candidate.id !== command.id)
      return
    }
    case 'add-signature': {
      assertIntegerRange(command.tick, 0, Number.MAX_SAFE_INTEGER, '拍号 tick')
      assertIntegerRange(command.numerator, 1, 32, '拍号分子')
      if (!isPowerOfTwo(command.denominator) || command.denominator > 128) {
        throw new EditorCommandError('invalid-value', '拍号分母必须是 1–128 的 2 的幂')
      }
      document.timeSignatureEvents.push({
        id: createId('signature'),
        trackId: globalEventTrackId(document),
        tick: command.tick,
        numerator: command.numerator,
        denominator: command.denominator,
        metronome: 24,
        thirtyseconds: 8,
        sourceOrder: Number.MAX_SAFE_INTEGER,
        synthetic: false,
      })
      document.timeSignatureEvents.sort((left, right) => left.tick - right.tick)
      return
    }
    case 'update-signature': {
      const event = document.timeSignatureEvents.find((candidate) => candidate.id === command.id)
      if (!event) throw new EditorCommandError('not-found', '找不到拍号事件')
      if (command.changes.tick !== undefined) {
        assertIntegerRange(command.changes.tick, 0, Number.MAX_SAFE_INTEGER, '拍号 tick')
        event.tick = command.changes.tick
      }
      if (command.changes.numerator !== undefined) {
        assertIntegerRange(command.changes.numerator, 1, 32, '拍号分子')
        event.numerator = command.changes.numerator
      }
      if (command.changes.denominator !== undefined) {
        if (!isPowerOfTwo(command.changes.denominator) || command.changes.denominator > 128) {
          throw new EditorCommandError('invalid-value', '拍号分母必须是 1–128 的 2 的幂')
        }
        event.denominator = command.changes.denominator
      }
      event.synthetic = false
      document.timeSignatureEvents.sort((left, right) => left.tick - right.tick)
      return
    }
    case 'delete-signature': {
      const event = document.timeSignatureEvents.find((candidate) => candidate.id === command.id)
      if (!event) throw new EditorCommandError('not-found', '找不到拍号事件')
      if (event.tick === 0) {
        throw new EditorCommandError('initial-event', '起始拍号事件不能删除')
      }
      document.timeSignatureEvents = document.timeSignatureEvents.filter(
        (candidate) => candidate.id !== command.id,
      )
      return
    }
  }
}
