import { describe, expect, it } from 'vitest'
import { createBlankDocument } from './defaultDocument'
import {
  bpmToMicroseconds,
  secondsToTicks,
  snapTick,
  ticksToSeconds,
  tickToMusicalPosition,
} from './time'

describe('MIDI time conversions', () => {
  it('converts ticks and seconds across tempo changes', () => {
    const document = createBlankDocument()
    const conductor = document.tracks[0]
    if (!conductor) throw new Error('missing conductor track')
    document.tempoEvents.push({
      id: 'tempo-2',
      trackId: conductor.id,
      tick: 480,
      microsecondsPerBeat: bpmToMicroseconds(60),
      sourceOrder: 10,
      synthetic: false,
    })

    expect(ticksToSeconds(document, 480)).toBeCloseTo(0.5)
    expect(ticksToSeconds(document, 960)).toBeCloseTo(1.5)
    expect(secondsToTicks(document, 1.5)).toBe(960)
  })

  it('snaps using rational subdivisions without accumulating drift', () => {
    expect(snapTick(81, 480, 6)).toBe(80)
    expect(snapTick(159, 480, 6)).toBe(160)
    expect(snapTick(-10, 480, 4)).toBe(0)
  })

  it('formats musical positions using the current time signature', () => {
    const document = createBlankDocument()
    expect(tickToMusicalPosition(document, 0).label).toBe('1.1.0')
    expect(tickToMusicalPosition(document, 1920).label).toBe('2.1.0')
    expect(tickToMusicalPosition(document, 2400).label).toBe('2.2.0')
  })
})
