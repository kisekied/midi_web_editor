import { type MidiData, type MidiEvent, parseMidi, writeMidi } from 'midi-file'
import { describe, expect, it } from 'vitest'
import { decodeMidi, encodeMidi, MidiCodecError } from './codecCore'

function fixture(): Uint8Array {
  const midi: MidiData = {
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [
      [
        { deltaTime: 0, meta: true, type: 'trackName', text: 'Fidelity Track' },
        { deltaTime: 0, type: 'programChange', channel: 0, programNumber: 12 },
        { deltaTime: 0, type: 'controller', channel: 0, controllerType: 64, value: 127 },
        { deltaTime: 0, type: 'sysEx', data: [1, 2, 3, 4] },
        { deltaTime: 0, meta: true, type: 'unknownMeta', metatypeByte: 0x7e, data: [9, 8] },
        { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 100 },
        { deltaTime: 480, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, meta: true, type: 'endOfTrack' },
      ],
    ],
  }
  return Uint8Array.from(writeMidi(midi))
}

function absoluteEvents(events: MidiEvent[]) {
  let tick = 0
  return events.map((event) => {
    tick += event.deltaTime
    return { tick, event }
  })
}

describe('MIDI codec', () => {
  it('decodes Type 0 notes while retaining passthrough events', () => {
    const result = decodeMidi(fixture(), 'roundtrip.mid')
    const track = result.document.tracks[0]
    expect(result.document.format).toBe(0)
    expect(result.document.name).toBe('roundtrip')
    expect(track?.name).toBe('Fidelity Track')
    expect(track?.notes[0]).toMatchObject({
      startTick: 0,
      durationTicks: 480,
      pitch: 60,
      velocity: 100,
    })
    expect(track?.passthroughEvents.map((item) => item.event.type)).toEqual(
      expect.arrayContaining(['controller', 'sysEx', 'unknownMeta', 'programChange']),
    )
  })

  it('uses the imported file name instead of an embedded track name for the project', () => {
    const result = decodeMidi(fixture(), '  My Song.MIDI')

    expect(result.document.name).toBe('My Song')
    expect(result.document.tracks[0]?.name).toBe('Fidelity Track')
  })

  it('preserves unsupported event track, tick and payload after editing a note', () => {
    const result = decodeMidi(fixture(), 'roundtrip.mid')
    const track = result.document.tracks[0]
    if (!track?.notes[0]) throw new Error('missing decoded note')
    track.notes[0].pitch = 67

    const output = parseMidi(encodeMidi(result.document))
    expect(output.header.format).toBe(0)
    const events = absoluteEvents(output.tracks[0] ?? [])
    const sysEx = events.find(({ event }) => event.type === 'sysEx')
    expect(sysEx?.tick).toBe(0)
    expect(Array.from((sysEx?.event as { data: ArrayLike<number> }).data)).toEqual([1, 2, 3, 4])
    const unknown = events.find(({ event }) => event.type === 'unknownMeta')
    expect(unknown?.tick).toBe(0)
    expect(unknown?.event).toMatchObject({ type: 'unknownMeta', metatypeByte: 0x7e })
    expect(Array.from((unknown?.event as { data: ArrayLike<number> }).data)).toEqual([9, 8])
    expect(events.find(({ event }) => event.type === 'noteOn')).toMatchObject({
      event: { noteNumber: 67 },
    })
  })

  it('rejects SMF Type 2', () => {
    const bytes = Uint8Array.from(
      writeMidi({
        header: { format: 2, numTracks: 1, ticksPerBeat: 480 },
        tracks: [[{ deltaTime: 0, meta: true, type: 'endOfTrack' }]],
      }),
    )
    expect(() => decodeMidi(bytes, 'type2.mid')).toThrowError(MidiCodecError)
  })
})
