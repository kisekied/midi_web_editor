export interface PlaybackVolumePreference {
  volume: number
  lastNonZeroVolume: number
}

export const PLAYBACK_VOLUME_STORAGE_KEY = 'zhiyin-playback-volume'
export const DEFAULT_PLAYBACK_VOLUME = 100

export function clampPlaybackVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PLAYBACK_VOLUME
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function resolvePlaybackVolume(storedValue: string | null): PlaybackVolumePreference {
  if (!storedValue) {
    return {
      volume: DEFAULT_PLAYBACK_VOLUME,
      lastNonZeroVolume: DEFAULT_PLAYBACK_VOLUME,
    }
  }
  try {
    const parsed = JSON.parse(storedValue) as {
      volume?: unknown
      lastNonZeroVolume?: unknown
    }
    if (typeof parsed.volume !== 'number' || typeof parsed.lastNonZeroVolume !== 'number') {
      throw new Error('invalid playback volume preference')
    }
    const volume = clampPlaybackVolume(parsed.volume)
    const lastNonZeroVolume = clampPlaybackVolume(parsed.lastNonZeroVolume)
    return {
      volume,
      lastNonZeroVolume: lastNonZeroVolume > 0 ? lastNonZeroVolume : DEFAULT_PLAYBACK_VOLUME,
    }
  } catch {
    return {
      volume: DEFAULT_PLAYBACK_VOLUME,
      lastNonZeroVolume: DEFAULT_PLAYBACK_VOLUME,
    }
  }
}

export function getInitialPlaybackVolume(): PlaybackVolumePreference {
  try {
    return resolvePlaybackVolume(window.localStorage.getItem(PLAYBACK_VOLUME_STORAGE_KEY))
  } catch {
    return resolvePlaybackVolume(null)
  }
}

export function storePlaybackVolume(preference: PlaybackVolumePreference): void {
  try {
    window.localStorage.setItem(PLAYBACK_VOLUME_STORAGE_KEY, JSON.stringify(preference))
  } catch {
    // The preference still applies for this session when storage is unavailable.
  }
}
