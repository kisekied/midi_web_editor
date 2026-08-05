export type MidiFormat = 0 | 1

export interface RawMidiEvent {
  deltaTime: number
  type: string
  [key: string]: unknown
}

export interface PassthroughEvent {
  id: string
  absoluteTick: number
  sourceOrder: number
  event: RawMidiEvent
}

export interface MidiNote {
  id: string
  startTick: number
  durationTicks: number
  pitch: number
  velocity: number
  releaseVelocity: number
  channel: number
  sourceOnOrder: number
  sourceOffOrder: number
  sourceOn?: RawMidiEvent
  sourceOff?: RawMidiEvent
  importedOverlap: boolean
}

export interface MidiTrack {
  id: string
  sourceIndex: number
  kind: 'conductor' | 'music'
  name: string
  originalName: string
  nameEventId?: string
  defaultChannel: number
  defaultProgram: number
  originalProgram: number
  programEventId?: string
  notes: MidiNote[]
  passthroughEvents: PassthroughEvent[]
}

export interface TempoEvent {
  id: string
  trackId: string
  tick: number
  microsecondsPerBeat: number
  sourceOrder: number
  source?: RawMidiEvent
  synthetic: boolean
}

export interface TimeSignatureEvent {
  id: string
  trackId: string
  tick: number
  numerator: number
  denominator: number
  metronome: number
  thirtyseconds: number
  sourceOrder: number
  source?: RawMidiEvent
  synthetic: boolean
}

export interface MidiDocument {
  id: string
  name: string
  format: MidiFormat
  ppq: number
  tracks: MidiTrack[]
  tempoEvents: TempoEvent[]
  timeSignatureEvents: TimeSignatureEvent[]
  importedAt?: number
}

export type TrackRoute = { kind: 'internal' } | { kind: 'midi'; portId: string }

export interface LoopRange {
  enabled: boolean
  startTick: number
  endTick: number
}

export interface DecodeWarning {
  code: 'unmatched-note' | 'overlap' | 'nonstandard-event' | 'empty-file'
  message: string
  trackId?: string
}

export interface DecodeResult {
  document: MidiDocument
  warnings: DecodeWarning[]
}

export interface SessionSnapshot {
  version: 1
  document: MidiDocument
  routes: Record<string, TrackRoute>
  mutedTrackIds: string[]
  soloTrackIds: string[]
  selectedTrackId: string | null
  snapStepsPerQuarter: number
  zoom: number
  loop: LoopRange
  dirty: boolean
  savedAt: number
}

export interface MidiOutputDevice {
  id: string
  name: string
  manufacturer: string
  state: 'connected' | 'disconnected'
}
