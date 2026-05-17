import { CREDITS } from '../credits'
import { describe, expect, it } from 'vitest'

import type { Credit } from '../credits'

describe('credits module', () => {
  it('exports a readonly CREDITS array', () => {
    expect(Array.isArray(CREDITS)).toBe(true)
  })

  it('every entry has a non-empty name and role', () => {
    for (const entry of CREDITS) {
      expect(typeof entry.name).toBe('string')
      expect(entry.name.length).toBeGreaterThan(0)
      expect(typeof entry.role).toBe('string')
      expect(entry.role.length).toBeGreaterThan(0)
    }
  })

  it('Credit type matches entry shape', () => {
    const probe: Credit = { name: 'x', role: 'y' }
    expect(probe.name).toBe('x')
    expect(probe.role).toBe('y')
  })
})
