export type PitchLabelMode = 'all' | 'c-only'

export const PITCH_LABEL_MODE_STORAGE_KEY = 'zhiyin-pitch-label-mode'

export function resolvePitchLabelMode(storedMode: string | null): PitchLabelMode {
  return storedMode === 'all' ? 'all' : 'c-only'
}

export function getInitialPitchLabelMode(): PitchLabelMode {
  try {
    return resolvePitchLabelMode(window.localStorage.getItem(PITCH_LABEL_MODE_STORAGE_KEY))
  } catch {
    return 'c-only'
  }
}

export function storePitchLabelMode(mode: PitchLabelMode): void {
  try {
    window.localStorage.setItem(PITCH_LABEL_MODE_STORAGE_KEY, mode)
  } catch {
    // The preference still applies for this session when storage is unavailable.
  }
}
