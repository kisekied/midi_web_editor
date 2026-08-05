import { DEFAULT_TEMPO_MICROSECONDS } from './defaultDocument'
import type { MidiDocument, TempoEvent, TimeSignatureEvent } from './types'

export interface MusicalPosition {
  bar: number
  beat: number
  tick: number
  label: string
}

function sortedTempoEvents(document: MidiDocument): TempoEvent[] {
  return [...document.tempoEvents].sort(
    (left, right) => left.tick - right.tick || left.sourceOrder - right.sourceOrder,
  )
}

function sortedSignatureEvents(document: MidiDocument): TimeSignatureEvent[] {
  return [...document.timeSignatureEvents].sort(
    (left, right) => left.tick - right.tick || left.sourceOrder - right.sourceOrder,
  )
}

export function bpmToMicroseconds(bpm: number): number {
  const safeBpm = Math.min(999, Math.max(1, bpm))
  return Math.round(60_000_000 / safeBpm)
}

export function microsecondsToBpm(microseconds: number): number {
  return 60_000_000 / Math.max(1, microseconds)
}

export function ticksToSeconds(document: MidiDocument, targetTick: number): number {
  const target = Math.max(0, targetTick)
  const events = sortedTempoEvents(document)
  let currentTick = 0
  let seconds = 0
  let tempo = DEFAULT_TEMPO_MICROSECONDS

  for (const event of events) {
    if (event.tick > target) break
    if (event.tick > currentTick) {
      seconds += ((event.tick - currentTick) * tempo) / 1_000_000 / document.ppq
      currentTick = event.tick
    }
    tempo = event.microsecondsPerBeat
  }

  seconds += ((target - currentTick) * tempo) / 1_000_000 / document.ppq
  return seconds
}

export function secondsToTicks(document: MidiDocument, targetSeconds: number): number {
  const target = Math.max(0, targetSeconds)
  const events = sortedTempoEvents(document)
  let currentTick = 0
  let currentSeconds = 0
  let tempo = DEFAULT_TEMPO_MICROSECONDS

  for (const event of events) {
    if (event.tick < currentTick) continue
    const segmentSeconds = ((event.tick - currentTick) * tempo) / 1_000_000 / document.ppq
    if (currentSeconds + segmentSeconds > target) break
    currentSeconds += segmentSeconds
    currentTick = event.tick
    tempo = event.microsecondsPerBeat
  }

  const remainingSeconds = target - currentSeconds
  return Math.max(
    0,
    Math.round(currentTick + (remainingSeconds * 1_000_000 * document.ppq) / tempo),
  )
}

export function snapTick(tick: number, ppq: number, stepsPerQuarter: number): number {
  const safeSteps = Math.max(1, stepsPerQuarter)
  return Math.max(0, Math.round((Math.round((tick * safeSteps) / ppq) * ppq) / safeSteps))
}

export function signatureAtTick(document: MidiDocument, tick: number): TimeSignatureEvent {
  const events = sortedSignatureEvents(document)
  let active = events[0]
  for (const event of events) {
    if (event.tick > tick) break
    active = event
  }

  return (
    active ?? {
      id: 'virtual-signature',
      trackId: document.tracks[0]?.id ?? '',
      tick: 0,
      numerator: 4,
      denominator: 4,
      metronome: 24,
      thirtyseconds: 8,
      sourceOrder: 0,
      synthetic: true,
    }
  )
}

export function ticksPerMeasure(document: MidiDocument, signature: TimeSignatureEvent): number {
  return Math.max(1, Math.round(document.ppq * signature.numerator * (4 / signature.denominator)))
}

export function tickToMusicalPosition(document: MidiDocument, targetTick: number): MusicalPosition {
  const target = Math.max(0, targetTick)
  const events = sortedSignatureEvents(document)
  let segmentStartTick = 0
  let barOffset = 0
  let signature = events[0] ?? signatureAtTick(document, 0)

  for (const event of events) {
    if (event.tick === 0) {
      signature = event
      continue
    }
    if (event.tick > target) break
    const previousMeasureTicks = ticksPerMeasure(document, signature)
    barOffset += Math.floor((event.tick - segmentStartTick) / previousMeasureTicks)
    segmentStartTick = event.tick
    signature = event
  }

  const measureTicks = ticksPerMeasure(document, signature)
  const relative = Math.max(0, target - segmentStartTick)
  const barInSegment = Math.floor(relative / measureTicks)
  const tickInBar = relative % measureTicks
  const beatTicks = document.ppq * (4 / signature.denominator)
  const beat = Math.floor(tickInBar / beatTicks)
  const tickInBeat = Math.round(tickInBar - beat * beatTicks)
  const position = {
    bar: barOffset + barInSegment + 1,
    beat: beat + 1,
    tick: tickInBeat,
    label: '',
  }
  position.label = `${position.bar}.${position.beat}.${position.tick}`
  return position
}

export function barStartAtOrBefore(document: MidiDocument, tick: number): number {
  const target = Math.max(0, tick)
  const events = sortedSignatureEvents(document)
  let segmentStartTick = 0
  let signature = events[0] ?? signatureAtTick(document, 0)

  for (const event of events) {
    if (event.tick === 0) {
      signature = event
      continue
    }
    if (event.tick > target) break
    segmentStartTick = event.tick
    signature = event
  }

  const measureTicks = ticksPerMeasure(document, signature)
  return segmentStartTick + Math.floor((target - segmentStartTick) / measureTicks) * measureTicks
}

export function documentEndTick(document: MidiDocument): number {
  let endTick = document.ppq * 16
  for (const track of document.tracks) {
    for (const note of track.notes) {
      endTick = Math.max(endTick, note.startTick + note.durationTicks)
    }
    for (const event of track.passthroughEvents) {
      endTick = Math.max(endTick, event.absoluteTick)
    }
  }
  for (const event of document.tempoEvents) endTick = Math.max(endTick, event.tick)
  for (const event of document.timeSignatureEvents) endTick = Math.max(endTick, event.tick)
  return endTick
}
