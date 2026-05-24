import { describe, expect, it } from 'vitest'

import { canCross, generateEgregoreGenome, generateTraitBag } from '../genetics'
import { getEgregoreManualEntries } from '../manual'
import { FloraSpecies } from '../types'

import { createTestState } from './helpers'

import type { EgregoreGenome, TraitBag } from '../genetics'

const nativeBag = (): TraitBag => generateTraitBag('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')

const egregoreGenome = (): EgregoreGenome =>
  generateEgregoreGenome(5, 7, 'TestSteward', { allelopathy: 0.8, spreadVelocity: 0.3 })

describe('canCross — native × egregore refusal (RP-8b)', () => {
  it('returns true for two native TraitBags', () => {
    expect(canCross(nativeBag(), nativeBag())).toBe(true)
  })

  it('returns true for two EgregoreGenomes', () => {
    expect(canCross(egregoreGenome(), egregoreGenome())).toBe(true)
  })

  it('returns false for native × egregore', () => {
    expect(canCross(nativeBag(), egregoreGenome())).toBe(false)
  })

  it('returns false for egregore × native (commutative)', () => {
    expect(canCross(egregoreGenome(), nativeBag())).toBe(false)
  })

  it('treats a TraitBag with no __kind field as native', () => {
    const legacyBag = nativeBag()
    expect((legacyBag as TraitBag & { __kind?: string }).__kind).toBeUndefined()
    expect(canCross(legacyBag, nativeBag())).toBe(true)
    expect(canCross(legacyBag, egregoreGenome())).toBe(false)
  })
})

describe('manual footnote — no compatible regions (RP-8b)', () => {
  it('does not append a footnote line when no native flora is discovered', () => {
    const state = createTestState()
    state.egregorePositions = [{ x: 5, y: 7 }]
    state.manualDiscoveries = new Set() // no flora:* entries
    const entries = getEgregoreManualEntries(state)
    expect(entries.length).toBe(1)
    expect(entries[0].lore.includes('\n')).toBe(false)
  })

  it('appends a footnote line once any flora species is discovered', () => {
    const state = createTestState()
    state.egregorePositions = [{ x: 5, y: 7 }]
    state.manualDiscoveries = new Set([`flora:${FloraSpecies.Clover}`])
    const entries = getEgregoreManualEntries(state)
    expect(entries.length).toBe(1)
    expect(entries[0].lore.includes('\n')).toBe(true)
    // The footnote line should contain at least 3 EVA tokens (space-separated).
    const lines = entries[0].lore.split('\n')
    const footnote = lines[lines.length - 1]
    const tokens = footnote.split(' ')
    expect(tokens.length).toBeGreaterThanOrEqual(3)
    expect(tokens.length).toBeLessThanOrEqual(5)
  })

  it('does not include the literal English phrase "no compatible regions"', () => {
    const state = createTestState()
    state.egregorePositions = [{ x: 5, y: 7 }]
    state.manualDiscoveries = new Set([`flora:${FloraSpecies.Clover}`])
    const entries = getEgregoreManualEntries(state)
    expect(entries[0].lore.toLowerCase()).not.toContain('no compatible regions')
    expect(entries[0].lore.toLowerCase()).not.toContain('compatible')
    expect(entries[0].lore.toLowerCase()).not.toContain('region')
  })

  it('footnote tokens are stable across calls for the same position', () => {
    const state = createTestState()
    state.egregorePositions = [{ x: 5, y: 7 }]
    state.manualDiscoveries = new Set([`flora:${FloraSpecies.Clover}`])
    const a = getEgregoreManualEntries(state)
    const b = getEgregoreManualEntries(state)
    expect(a[0].lore).toBe(b[0].lore)
  })
})
