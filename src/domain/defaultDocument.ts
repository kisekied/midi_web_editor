import { createId } from './id'
import type { MidiDocument, MidiTrack } from './types'

export const DEFAULT_PPQ = 480
export const DEFAULT_TEMPO_MICROSECONDS = 500_000

function createConductorTrack(): MidiTrack {
  return {
    id: createId('track'),
    sourceIndex: 0,
    kind: 'conductor',
    name: '全局事件',
    originalName: '全局事件',
    defaultChannel: 0,
    defaultProgram: 0,
    originalProgram: 0,
    notes: [],
    passthroughEvents: [],
  }
}

export function createMusicTrack(index: number, name = `轨道 ${index}`): MidiTrack {
  return {
    id: createId('track'),
    sourceIndex: index,
    kind: 'music',
    name,
    originalName: name,
    defaultChannel: Math.min(15, Math.max(0, index - 1)),
    defaultProgram: 0,
    originalProgram: 0,
    notes: [],
    passthroughEvents: [],
  }
}

export function createBlankDocument(name = '未命名作品'): MidiDocument {
  const conductor = createConductorTrack()
  const musicTrack = createMusicTrack(1)

  return {
    id: createId('document'),
    name,
    format: 1,
    ppq: DEFAULT_PPQ,
    tracks: [conductor, musicTrack],
    tempoEvents: [
      {
        id: createId('tempo'),
        trackId: conductor.id,
        tick: 0,
        microsecondsPerBeat: DEFAULT_TEMPO_MICROSECONDS,
        sourceOrder: 0,
        synthetic: true,
      },
    ],
    timeSignatureEvents: [
      {
        id: createId('signature'),
        trackId: conductor.id,
        tick: 0,
        numerator: 4,
        denominator: 4,
        metronome: 24,
        thirtyseconds: 8,
        sourceOrder: 1,
        synthetic: true,
      },
    ],
  }
}
