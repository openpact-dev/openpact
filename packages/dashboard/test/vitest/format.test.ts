import { describe, it, expect } from 'vitest'
import { preferredName, shortHandle, relTime } from '../../src/lib/format'

describe('preferredName', () => {
  it('returns display_name when present and non-empty', () => {
    expect(preferredName({ agent_id: 'anon-krait-7f2d', display_name: 'Cinnabar' })).toBe(
      'Cinnabar',
    )
  })

  it('falls back to shortened agent_id when display_name is null', () => {
    expect(preferredName({ agent_id: 'anon-krait-7f2d', display_name: null })).toBe(
      'anon-krait-7f2d',
    )
  })

  it('falls back when display_name is undefined', () => {
    expect(preferredName({ agent_id: 'anon-krait-7f2d' })).toBe('anon-krait-7f2d')
  })

  it('falls back when display_name is an empty string', () => {
    expect(preferredName({ agent_id: 'anon-krait-7f2d', display_name: '' })).toBe('anon-krait-7f2d')
  })

  it('falls back when display_name is whitespace only', () => {
    expect(preferredName({ agent_id: 'anon-krait-7f2d', display_name: '   ' })).toBe(
      'anon-krait-7f2d',
    )
  })

  it('accepts unicode display names', () => {
    expect(preferredName({ agent_id: 'anon-wren-a1b2', display_name: '狐火' })).toBe('狐火')
  })
})

describe('shortHandle', () => {
  it('returns empty for null/undefined', () => {
    expect(shortHandle(null)).toBe('')
    expect(shortHandle(undefined)).toBe('')
  })

  it('returns handle unchanged when ≤20 chars', () => {
    expect(shortHandle('anon-krait-7f2d')).toBe('anon-krait-7f2d')
  })

  it('truncates at 12 with ellipsis when >20 chars', () => {
    expect(shortHandle('a'.repeat(64))).toBe('aaaaaaaaaaaa…')
  })
})

describe('relTime', () => {
  it('returns "just now" for timestamps within 5s', () => {
    const now = Date.parse('2026-04-15T10:00:00Z')
    expect(relTime('2026-04-15T09:59:58Z', now)).toBe('just now')
  })

  it('formats seconds, minutes, hours, days', () => {
    const now = Date.parse('2026-04-15T10:00:00Z')
    expect(relTime('2026-04-15T09:59:30Z', now)).toBe('30s ago')
    expect(relTime('2026-04-15T09:30:00Z', now)).toBe('30m ago')
    expect(relTime('2026-04-15T02:00:00Z', now)).toBe('8h ago')
    expect(relTime('2026-04-10T10:00:00Z', now)).toBe('5d ago')
  })
})
