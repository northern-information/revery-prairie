import { describe, expect, it } from 'vitest'

import { EGREGORE_SPECIES, getEgregoreSpeciesAtPosition, getEgregoreSpeciesDef } from '../egregore/species'
import { EgregoreSpecies } from '../types'

describe('EGREGORE_SPECIES registry (precis #8b)', () => {
  it('has exactly two entries — Allelopath and Spreader', () => {
    const ids = Object.keys(EGREGORE_SPECIES).sort()
    expect(ids).toEqual(['allelopath', 'spreader'])
  })

  it('allelopath weights allelopathy higher than spreadVelocity', () => {
    const a = EGREGORE_SPECIES[EgregoreSpecies.Allelopath]
    expect(a.traitBias.allelopathy).toBeGreaterThan(a.traitBias.spreadVelocity)
  })

  it('spreader weights spreadVelocity higher than allelopathy', () => {
    const s = EGREGORE_SPECIES[EgregoreSpecies.Spreader]
    expect(s.traitBias.spreadVelocity).toBeGreaterThan(s.traitBias.allelopathy)
  })

  it('getEgregoreSpeciesDef returns the matching def', () => {
    expect(getEgregoreSpeciesDef(EgregoreSpecies.Allelopath).id).toBe(EgregoreSpecies.Allelopath)
    expect(getEgregoreSpeciesDef(EgregoreSpecies.Spreader).id).toBe(EgregoreSpecies.Spreader)
  })

  it('species glyph subsets are disjoint and cover all five glyph indices', () => {
    const a = new Set<number>(EGREGORE_SPECIES[EgregoreSpecies.Allelopath].glyphSubsetIndices)
    const s = new Set<number>(EGREGORE_SPECIES[EgregoreSpecies.Spreader].glyphSubsetIndices)
    for (const i of a) expect(s.has(i)).toBe(false)
    const union = new Set<number>([...a, ...s])
    expect(union.size).toBe(5)
  })
})

describe('getEgregoreSpeciesAtPosition (precis #8b)', () => {
  it('returns the same species for the same (x, y) across calls', () => {
    const first = getEgregoreSpeciesAtPosition(7, 11)
    const second = getEgregoreSpeciesAtPosition(7, 11)
    expect(first).toBe(second)
  })

  it('returns a value from the EgregoreSpecies enum', () => {
    const species = getEgregoreSpeciesAtPosition(12, 8)
    expect([EgregoreSpecies.Allelopath, EgregoreSpecies.Spreader]).toContain(species)
  })

  it('produces a balanced distribution across a 64x64 grid (both species appear)', () => {
    let allelopath = 0
    let spreader = 0
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const sp = getEgregoreSpeciesAtPosition(x, y)
        if (sp === EgregoreSpecies.Allelopath) allelopath++
        else spreader++
      }
    }
    expect(allelopath).toBeGreaterThan(0)
    expect(spreader).toBeGreaterThan(0)
    // The split is hash-bucketed; require each species to claim at least
    // 25% so a degenerate hash doesn't silently fail this test.
    const total = allelopath + spreader
    expect(allelopath / total).toBeGreaterThan(0.25)
    expect(spreader / total).toBeGreaterThan(0.25)
  })
})
