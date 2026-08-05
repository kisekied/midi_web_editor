import type { RawMidiEvent } from '../domain/types'

function numeric(event: RawMidiEvent, key: string, fallback = 0): number {
  const value = event[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function dataByte(value: number): number {
  return Math.min(127, Math.max(0, Math.round(value)))
}

export function eventToMidiMessage(event: RawMidiEvent): number[] | null {
  const channel = Math.min(15, Math.max(0, Math.round(numeric(event, 'channel'))))
  switch (event.type) {
    case 'programChange':
      return [0xc0 | channel, dataByte(numeric(event, 'programNumber'))]
    case 'controller':
      return [
        0xb0 | channel,
        dataByte(numeric(event, 'controllerType')),
        dataByte(numeric(event, 'value')),
      ]
    case 'pitchBend': {
      const value = Math.min(16_383, Math.max(0, Math.round(numeric(event, 'value') + 8192)))
      return [0xe0 | channel, value & 0x7f, (value >> 7) & 0x7f]
    }
    case 'noteAftertouch':
      return [
        0xa0 | channel,
        dataByte(numeric(event, 'noteNumber')),
        dataByte(numeric(event, 'amount')),
      ]
    case 'channelAftertouch':
      return [0xd0 | channel, dataByte(numeric(event, 'amount'))]
    default:
      return null
  }
}
