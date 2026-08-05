import { describe, expect, it } from 'vitest'
import { eventToMidiMessage } from './midiMessages'

describe('external MIDI message conversion', () => {
  it('converts safe channel messages to MIDI bytes', () => {
    expect(
      eventToMidiMessage({
        deltaTime: 0,
        type: 'controller',
        channel: 2,
        controllerType: 64,
        value: 127,
      }),
    ).toEqual([0xb2, 64, 127])
    expect(eventToMidiMessage({ deltaTime: 0, type: 'pitchBend', channel: 0, value: 0 })).toEqual([
      0xe0, 0, 64,
    ])
  })

  it('never forwards SysEx or meta events', () => {
    expect(eventToMidiMessage({ deltaTime: 0, type: 'sysEx', data: [0x7e] })).toBeNull()
    expect(eventToMidiMessage({ deltaTime: 0, type: 'trackName', text: 'test' })).toBeNull()
  })

  it('clamps malformed channel data before sending it to a device', () => {
    expect(
      eventToMidiMessage({
        deltaTime: 0,
        type: 'controller',
        channel: 99,
        controllerType: -1,
        value: 300,
      }),
    ).toEqual([0xbf, 0, 127])
  })
})
