import { describe, expect, it } from 'vitest'
import { pitchGridLineKind } from './PianoRoll'

describe('piano roll pitch groups', () => {
  it('assigns each group divider to the row boundary below C', () => {
    expect(pitchGridLineKind(59)).toBe('middle-c')
    expect(pitchGridLineKind(60)).toBe('row')
    expect(pitchGridLineKind(71)).toBe('octave')
    expect(pitchGridLineKind(72)).toBe('row')
  })
})
