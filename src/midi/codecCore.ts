import { parseMidi as parseMidiPackage, writeMidi as writeMidiPackage } from 'midi-file'
import { createMusicTrack, DEFAULT_TEMPO_MICROSECONDS } from '../domain/defaultDocument'
import { createId } from '../domain/id'
import type {
  DecodeResult,
  DecodeWarning,
  MidiDocument,
  MidiFormat,
  MidiNote,
  MidiTrack,
  PassthroughEvent,
  RawMidiEvent,
  TempoEvent,
  TimeSignatureEvent,
} from '../domain/types'

interface ParsedMidi {
  header: {
    format: number
    numTracks: number
    ticksPerBeat?: number
    framesPerSecond?: number
    ticksPerFrame?: number
  }
  tracks: RawMidiEvent[][]
}

interface AbsoluteEncodedEvent {
  tick: number
  sourceOrder: number
  priority: number
  event: RawMidiEvent
}

interface HeldNote {
  tick: number
  sourceOrder: number
  event: RawMidiEvent
}

const parseMidi = parseMidiPackage as unknown as (data: Uint8Array) => ParsedMidi
const writeMidi = writeMidiPackage as unknown as (data: ParsedMidi) => number[]

export class MidiCodecError extends Error {
  constructor(
    readonly code: 'invalid-file' | 'unsupported-format' | 'unsupported-timebase' | 'encode-error',
    message: string,
  ) {
    super(message)
    this.name = 'MidiCodecError'
  }
}

function cloneRawEvent(event: RawMidiEvent): RawMidiEvent {
  return { ...event, deltaTime: 0 }
}

function numeric(event: RawMidiEvent, key: string, fallback = 0): number {
  const value = event[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringValue(event: RawMidiEvent, key: string, fallback = ''): string {
  const value = event[key]
  return typeof value === 'string' ? value : fallback
}

function isChannelEvent(event: RawMidiEvent): boolean {
  return typeof event.channel === 'number'
}

function cleanFileName(fileName: string): string {
  return fileName.replace(/\.(mid|midi)$/i, '').trim() || '导入的 MIDI'
}

function decodeMidiText(text: string): string {
  if (!text || [...text].every((character) => character.charCodeAt(0) < 0x80)) return text
  try {
    const bytes = Uint8Array.from([...text].map((character) => character.charCodeAt(0) & 0xff))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return text
  }
}

function encodeMidiText(text: string): string {
  const bytes = new TextEncoder().encode(text)
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
}

function toPassthrough(
  absoluteTick: number,
  sourceOrder: number,
  event: RawMidiEvent,
): PassthroughEvent {
  return {
    id: createId('event'),
    absoluteTick,
    sourceOrder,
    event: cloneRawEvent(event),
  }
}

function noteKey(event: RawMidiEvent): string {
  return `${numeric(event, 'channel')}:${numeric(event, 'noteNumber')}`
}

function createDecodedNote(held: HeldNote, release: HeldNote, importedOverlap: boolean): MidiNote {
  return {
    id: createId('note'),
    startTick: held.tick,
    durationTicks: release.tick - held.tick,
    pitch: numeric(held.event, 'noteNumber'),
    velocity: Math.max(1, numeric(held.event, 'velocity', 100)),
    releaseVelocity: numeric(release.event, 'velocity'),
    channel: numeric(held.event, 'channel'),
    sourceOnOrder: held.sourceOrder,
    sourceOffOrder: release.sourceOrder,
    sourceOn: cloneRawEvent(held.event),
    sourceOff: cloneRawEvent(release.event),
    importedOverlap,
  }
}

function decodeTrack(
  rawTrack: RawMidiEvent[],
  sourceIndex: number,
  warnings: DecodeWarning[],
): {
  track: MidiTrack
  tempos: TempoEvent[]
  signatures: TimeSignatureEvent[]
} {
  const trackId = createId('track')
  const passthroughEvents: PassthroughEvent[] = []
  const notes: MidiNote[] = []
  const tempos: TempoEvent[] = []
  const signatures: TimeSignatureEvent[] = []
  const heldNotes = new Map<string, HeldNote[]>()
  const overlappingKeys = new Set<string>()
  let absoluteTick = 0
  let trackName = sourceIndex === 0 ? '全局事件' : `轨道 ${sourceIndex}`
  let nameEventId: string | undefined
  let defaultChannel = 0
  let defaultProgram = 0
  let programEventId: string | undefined
  let hasChannelData = false

  rawTrack.forEach((event, sourceOrder) => {
    absoluteTick += Math.max(0, numeric(event, 'deltaTime'))
    const raw = cloneRawEvent(event)

    if (event.type === 'setTempo') {
      tempos.push({
        id: createId('tempo'),
        trackId,
        tick: absoluteTick,
        microsecondsPerBeat: numeric(event, 'microsecondsPerBeat', DEFAULT_TEMPO_MICROSECONDS),
        sourceOrder,
        source: raw,
        synthetic: false,
      })
      return
    }

    if (event.type === 'timeSignature') {
      signatures.push({
        id: createId('signature'),
        trackId,
        tick: absoluteTick,
        numerator: numeric(event, 'numerator', 4),
        denominator: numeric(event, 'denominator', 4),
        metronome: numeric(event, 'metronome', 24),
        thirtyseconds: numeric(event, 'thirtyseconds', 8),
        sourceOrder,
        source: raw,
        synthetic: false,
      })
      return
    }

    const isNoteOn = event.type === 'noteOn' && numeric(event, 'velocity') > 0
    const isNoteOff = event.type === 'noteOff' || (event.type === 'noteOn' && !isNoteOn)
    if (isNoteOn) {
      hasChannelData = true
      defaultChannel = numeric(event, 'channel')
      const key = noteKey(event)
      const queue = heldNotes.get(key) ?? []
      if (queue.length > 0) overlappingKeys.add(key)
      queue.push({ tick: absoluteTick, sourceOrder, event: raw })
      heldNotes.set(key, queue)
      return
    }

    if (isNoteOff) {
      hasChannelData = true
      const key = noteKey(event)
      const queue = heldNotes.get(key)
      const held = queue?.shift()
      if (!held) {
        passthroughEvents.push(toPassthrough(absoluteTick, sourceOrder, event))
        warnings.push({
          code: 'unmatched-note',
          message: `轨道 ${sourceIndex + 1} 含无法配对的 note-off，已原样保留`,
          trackId,
        })
        return
      }
      if (absoluteTick <= held.tick) {
        passthroughEvents.push(toPassthrough(held.tick, held.sourceOrder, held.event))
        passthroughEvents.push(toPassthrough(absoluteTick, sourceOrder, event))
        warnings.push({
          code: 'unmatched-note',
          message: `轨道 ${sourceIndex + 1} 含零时值或逆序音符，已原样保留`,
          trackId,
        })
        return
      }
      notes.push(
        createDecodedNote(
          held,
          { tick: absoluteTick, sourceOrder, event: raw },
          overlappingKeys.has(key),
        ),
      )
      return
    }

    const passthrough = toPassthrough(absoluteTick, sourceOrder, event)
    passthroughEvents.push(passthrough)
    if (isChannelEvent(event)) {
      hasChannelData = true
      defaultChannel = numeric(event, 'channel')
    }
    if (event.type === 'trackName' && !nameEventId) {
      trackName = decodeMidiText(stringValue(event, 'text', trackName))
      nameEventId = passthrough.id
    }
    if (event.type === 'programChange' && !programEventId) {
      defaultProgram = numeric(event, 'programNumber')
      defaultChannel = numeric(event, 'channel')
      programEventId = passthrough.id
    }
  })

  for (const queue of heldNotes.values()) {
    for (const held of queue) {
      passthroughEvents.push(toPassthrough(held.tick, held.sourceOrder, held.event))
      warnings.push({
        code: 'unmatched-note',
        message: `轨道 ${sourceIndex + 1} 含无法配对的 note-on，已原样保留`,
        trackId,
      })
    }
  }

  if (overlappingKeys.size > 0) {
    warnings.push({
      code: 'overlap',
      message: `轨道 ${sourceIndex + 1} 含同键重叠音符；原事件会保留，编辑器不会创建新的重叠`,
      trackId,
    })
  }

  notes.sort((left, right) => left.startTick - right.startTick || left.pitch - right.pitch)
  passthroughEvents.sort(
    (left, right) => left.absoluteTick - right.absoluteTick || left.sourceOrder - right.sourceOrder,
  )

  const track: MidiTrack = {
    id: trackId,
    sourceIndex,
    kind: sourceIndex === 0 && notes.length === 0 && !hasChannelData ? 'conductor' : 'music',
    name: trackName,
    originalName: trackName,
    defaultChannel,
    defaultProgram,
    originalProgram: defaultProgram,
    notes,
    passthroughEvents,
  }
  if (nameEventId) track.nameEventId = nameEventId
  if (programEventId) track.programEventId = programEventId

  return { track, tempos, signatures }
}

export function decodeMidi(
  data: ArrayBuffer | Uint8Array,
  fileName = '导入的 MIDI.mid',
): DecodeResult {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (
    bytes.length < 14 ||
    bytes[0] !== 0x4d ||
    bytes[1] !== 0x54 ||
    bytes[2] !== 0x68 ||
    bytes[3] !== 0x64
  ) {
    throw new MidiCodecError('invalid-file', '文件不是有效的 Standard MIDI File')
  }

  let parsed: ParsedMidi
  try {
    parsed = parseMidi(bytes)
  } catch (error) {
    const detail = error instanceof Error ? error.message : '无法解析文件结构'
    throw new MidiCodecError('invalid-file', `MIDI 文件损坏或不完整：${detail}`)
  }

  if (parsed.header.format !== 0 && parsed.header.format !== 1) {
    throw new MidiCodecError(
      'unsupported-format',
      `暂不支持 SMF Type ${parsed.header.format}；请选择 Type 0 或 Type 1 文件`,
    )
  }
  if (!parsed.header.ticksPerBeat || parsed.header.framesPerSecond) {
    throw new MidiCodecError('unsupported-timebase', '暂不支持 SMPTE time division')
  }

  const warnings: DecodeWarning[] = []
  const tracks: MidiTrack[] = []
  const tempoEvents: TempoEvent[] = []
  const timeSignatureEvents: TimeSignatureEvent[] = []

  parsed.tracks.forEach((rawTrack, sourceIndex) => {
    const decoded = decodeTrack(rawTrack, sourceIndex, warnings)
    tracks.push(decoded.track)
    tempoEvents.push(...decoded.tempos)
    timeSignatureEvents.push(...decoded.signatures)
  })

  if (tracks.length === 0) {
    tracks.push(createMusicTrack(0, '轨道 1'))
    warnings.push({ code: 'empty-file', message: '文件没有轨道，已创建一条空轨道' })
  }
  if (!tracks.some((track) => track.kind === 'music')) {
    const firstTrack = tracks[0]
    if (firstTrack) firstTrack.kind = 'music'
  }

  const globalTrackId =
    tracks.find((track) => track.kind === 'conductor')?.id ?? tracks[0]?.id ?? ''
  if (!tempoEvents.some((event) => event.tick === 0)) {
    tempoEvents.push({
      id: createId('tempo'),
      trackId: globalTrackId,
      tick: 0,
      microsecondsPerBeat: DEFAULT_TEMPO_MICROSECONDS,
      sourceOrder: -2,
      synthetic: true,
    })
  }
  if (!timeSignatureEvents.some((event) => event.tick === 0)) {
    timeSignatureEvents.push({
      id: createId('signature'),
      trackId: globalTrackId,
      tick: 0,
      numerator: 4,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8,
      sourceOrder: -1,
      synthetic: true,
    })
  }
  tempoEvents.sort((left, right) => left.tick - right.tick || left.sourceOrder - right.sourceOrder)
  timeSignatureEvents.sort(
    (left, right) => left.tick - right.tick || left.sourceOrder - right.sourceOrder,
  )

  const namedTrack = tracks.find((track) => track.originalName && track.originalName !== '全局事件')
  const document: MidiDocument = {
    id: createId('document'),
    name: namedTrack?.originalName ?? cleanFileName(fileName),
    format: parsed.header.format as MidiFormat,
    ppq: parsed.header.ticksPerBeat,
    tracks,
    tempoEvents,
    timeSignatureEvents,
    importedAt: Date.now(),
  }

  return { document, warnings }
}

function eventPriority(event: RawMidiEvent): number {
  if (
    event.type === 'setTempo' ||
    event.type === 'timeSignature' ||
    event.type === 'programChange'
  ) {
    return 10
  }
  if (event.type === 'noteOff') return 20
  if (event.type === 'noteOn') return 30
  if (event.type === 'endOfTrack') return 100
  return 15
}

function addAbsoluteEvent(
  bucket: AbsoluteEncodedEvent[],
  tick: number,
  sourceOrder: number,
  event: RawMidiEvent,
): void {
  bucket.push({ tick, sourceOrder, priority: eventPriority(event), event })
}

function encodeTrackEvents(
  document: MidiDocument,
  track: MidiTrack,
  bucket: AbsoluteEncodedEvent[],
): void {
  let nameEventFound = false
  let programEventFound = false

  for (const passthrough of track.passthroughEvents) {
    if (passthrough.event.type === 'endOfTrack') continue
    const event = cloneRawEvent(passthrough.event)
    if (passthrough.id === track.nameEventId && track.name !== track.originalName) {
      event.text = encodeMidiText(track.name)
      nameEventFound = true
    }
    if (passthrough.id === track.nameEventId) nameEventFound = true
    if (passthrough.id === track.programEventId && track.defaultProgram !== track.originalProgram) {
      event.programNumber = track.defaultProgram
      programEventFound = true
    }
    if (passthrough.id === track.programEventId) programEventFound = true
    addAbsoluteEvent(bucket, passthrough.absoluteTick, passthrough.sourceOrder, event)
  }

  if (!nameEventFound && track.name && track.kind === 'music') {
    addAbsoluteEvent(bucket, 0, -10, {
      deltaTime: 0,
      meta: true,
      type: 'trackName',
      text: encodeMidiText(track.name),
    })
  }
  if (!programEventFound && track.defaultProgram !== track.originalProgram) {
    addAbsoluteEvent(bucket, 0, -9, {
      deltaTime: 0,
      type: 'programChange',
      channel: track.defaultChannel,
      programNumber: track.defaultProgram,
    })
  }

  for (const note of track.notes) {
    const noteOn: RawMidiEvent = {
      ...(note.sourceOn ?? {}),
      deltaTime: 0,
      type: 'noteOn',
      channel: note.channel,
      noteNumber: note.pitch,
      velocity: note.velocity,
    }
    const noteOff: RawMidiEvent = {
      ...(note.sourceOff ?? {}),
      deltaTime: 0,
      type: 'noteOff',
      channel: note.channel,
      noteNumber: note.pitch,
      velocity: note.releaseVelocity,
    }
    addAbsoluteEvent(bucket, note.startTick, note.sourceOnOrder, noteOn)
    addAbsoluteEvent(bucket, note.startTick + note.durationTicks, note.sourceOffOrder, noteOff)
  }

  for (const tempo of document.tempoEvents) {
    if (tempo.trackId !== track.id) continue
    if (tempo.synthetic && document.importedAt && !tempo.source) continue
    addAbsoluteEvent(bucket, tempo.tick, tempo.sourceOrder, {
      ...(tempo.source ?? {}),
      deltaTime: 0,
      meta: true,
      type: 'setTempo',
      microsecondsPerBeat: tempo.microsecondsPerBeat,
    })
  }

  for (const signature of document.timeSignatureEvents) {
    if (signature.trackId !== track.id) continue
    if (signature.synthetic && document.importedAt && !signature.source) continue
    addAbsoluteEvent(bucket, signature.tick, signature.sourceOrder, {
      ...(signature.source ?? {}),
      deltaTime: 0,
      meta: true,
      type: 'timeSignature',
      numerator: signature.numerator,
      denominator: signature.denominator,
      metronome: signature.metronome,
      thirtyseconds: signature.thirtyseconds,
    })
  }
}

function sortEncodedEvents(left: AbsoluteEncodedEvent, right: AbsoluteEncodedEvent): number {
  if (left.tick !== right.tick) return left.tick - right.tick
  const leftIsNew = left.sourceOrder > 1_000_000_000
  const rightIsNew = right.sourceOrder > 1_000_000_000
  if (leftIsNew && rightIsNew && left.priority !== right.priority) {
    return left.priority - right.priority
  }
  if (left.sourceOrder !== right.sourceOrder) return left.sourceOrder - right.sourceOrder
  return left.priority - right.priority
}

export function encodeMidi(document: MidiDocument): Uint8Array {
  if (document.format === 0 && document.tracks.length !== 1) {
    throw new MidiCodecError('encode-error', 'Type 0 文件必须且只能包含一条物理轨道')
  }
  if (!document.tracks.length) {
    throw new MidiCodecError('encode-error', '没有可导出的 MIDI 轨道')
  }

  try {
    const tracks = [...document.tracks]
      .sort((left, right) => left.sourceIndex - right.sourceIndex)
      .map((track) => {
        const bucket: AbsoluteEncodedEvent[] = []
        encodeTrackEvents(document, track, bucket)
        bucket.sort(sortEncodedEvents)

        const encoded: RawMidiEvent[] = []
        let previousTick = 0
        for (const item of bucket) {
          const tick = Math.max(previousTick, Math.round(item.tick))
          encoded.push({ ...item.event, deltaTime: tick - previousTick })
          previousTick = tick
        }
        encoded.push({ deltaTime: 0, meta: true, type: 'endOfTrack' })
        return encoded
      })

    const parsed: ParsedMidi = {
      header: {
        format: document.format,
        numTracks: tracks.length,
        ticksPerBeat: document.ppq,
      },
      tracks,
    }
    return Uint8Array.from(writeMidi(parsed))
  } catch (error) {
    if (error instanceof MidiCodecError) throw error
    const detail = error instanceof Error ? error.message : '未知编码错误'
    throw new MidiCodecError('encode-error', `无法导出 MIDI：${detail}`)
  }
}
