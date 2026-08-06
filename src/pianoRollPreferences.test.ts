import { describe, expect, it } from 'vitest'
import { resolvePitchLabelMode } from './pianoRollPreferences'

describe('piano roll preferences', () => {
  it('restores a valid pitch label mode', () => {
    expect(resolvePitchLabelMode('all')).toBe('all')
    expect(resolvePitchLabelMode('c-only')).toBe('c-only')
  })

  it('defaults to C-only labels when no valid preference is stored', () => {
    expect(resolvePitchLabelMode(null)).toBe('c-only')
    expect(resolvePitchLabelMode('unknown')).toBe('c-only')
  })
})
