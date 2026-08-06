import { describe, expect, it } from 'vitest'
import { resolveTheme } from './theme'

describe('theme preference', () => {
  it('uses an explicit stored theme before the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system when no valid preference has been stored', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
    expect(resolveTheme('unknown', false)).toBe('light')
  })
})
