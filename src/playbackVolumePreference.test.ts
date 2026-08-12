import { describe, expect, it } from 'vitest'
import {
  clampPlaybackVolume,
  DEFAULT_PLAYBACK_VOLUME,
  resolvePlaybackVolume,
} from './playbackVolumePreference'

describe('playback volume preference', () => {
  it('defaults to full volume when no valid preference is stored', () => {
    expect(resolvePlaybackVolume(null)).toEqual({ volume: 100, lastNonZeroVolume: 100 })
    expect(resolvePlaybackVolume('not-json')).toEqual({ volume: 100, lastNonZeroVolume: 100 })
    expect(resolvePlaybackVolume('{"volume":"quiet"}')).toEqual({
      volume: 100,
      lastNonZeroVolume: 100,
    })
  })

  it('restores and clamps stored volume values', () => {
    expect(resolvePlaybackVolume('{"volume":37,"lastNonZeroVolume":68}')).toEqual({
      volume: 37,
      lastNonZeroVolume: 68,
    })
    expect(resolvePlaybackVolume('{"volume":-20,"lastNonZeroVolume":140}')).toEqual({
      volume: 0,
      lastNonZeroVolume: 100,
    })
  })

  it('uses the default restore volume when the stored non-zero volume is zero', () => {
    expect(resolvePlaybackVolume('{"volume":0,"lastNonZeroVolume":0}')).toEqual({
      volume: 0,
      lastNonZeroVolume: DEFAULT_PLAYBACK_VOLUME,
    })
  })

  it('rounds and clamps individual volume changes', () => {
    expect(clampPlaybackVolume(48.6)).toBe(49)
    expect(clampPlaybackVolume(-1)).toBe(0)
    expect(clampPlaybackVolume(101)).toBe(100)
    expect(clampPlaybackVolume(Number.NaN)).toBe(100)
  })
})
