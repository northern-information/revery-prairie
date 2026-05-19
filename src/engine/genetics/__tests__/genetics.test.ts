import { describe, expect, it } from 'vitest'

import {
  crossTraitBags,
  generateGenesisIdentity,
  generateRuntimeIdentity,
  generateTraitBag,
  HEX_GRID_SIZE,
  hashToHexGrid,
  type TraitBag,
} from '@/engine/genetics'

// mulberry32 — local copy used as the rng argument to crossTraitBags so the
// test controls determinism without coupling to the genetics module's PRNG.
const createMulberry32 = (seed: number): (() => number) => {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('generateGenesisIdentity', () => {
  it('returns a 64-character lowercase hex string', () => {
    const id = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    expect(id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same inputs', () => {
    const a = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    const b = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    expect(a).toBe(b)
  })

  it('produces different identities across (binomial, seed, posKey) triples', () => {
    const base = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    const diffBinomial = generateGenesisIdentity('Echinacea purpurea', 12345, '7,7')
    const diffSeed = generateGenesisIdentity('Trifolium repens', 99999, '7,7')
    const diffPos = generateGenesisIdentity('Trifolium repens', 12345, '8,8')
    expect(base).not.toBe(diffBinomial)
    expect(base).not.toBe(diffSeed)
    expect(base).not.toBe(diffPos)
  })
})

describe('generateRuntimeIdentity', () => {
  it('returns a 64-character lowercase hex string', () => {
    const id = generateRuntimeIdentity('Trifolium repens', '7,7', 1000)
    expect(id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs from genesis identity for the same (binomial, posKey)', () => {
    const genesis = generateGenesisIdentity('Trifolium repens', 1000, '7,7')
    const runtime = generateRuntimeIdentity('Trifolium repens', '7,7', 1000)
    expect(genesis).not.toBe(runtime)
  })

  it('differs across different times for the same tile', () => {
    const t1 = generateRuntimeIdentity('Trifolium repens', '7,7', 1000)
    const t2 = generateRuntimeIdentity('Trifolium repens', '7,7', 1001)
    expect(t1).not.toBe(t2)
  })
})

describe('generateTraitBag', () => {
  it('returns four phenotype axes in [0, 1]', () => {
    const id = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    const bag = generateTraitBag(id)
    expect(bag.bloomTiming).toBeGreaterThanOrEqual(0)
    expect(bag.bloomTiming).toBeLessThan(1)
    expect(bag.coldTolerance).toBeGreaterThanOrEqual(0)
    expect(bag.coldTolerance).toBeLessThan(1)
    expect(bag.droughtResponse).toBeGreaterThanOrEqual(0)
    expect(bag.droughtResponse).toBeLessThan(1)
    expect(bag.pollinatorPreference).toBeGreaterThanOrEqual(0)
    expect(bag.pollinatorPreference).toBeLessThan(1)
  })

  it('returns 0-2 recessives, each in [0, 1)', () => {
    const id = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    const bag = generateTraitBag(id)
    expect(bag.recessives.length).toBeGreaterThanOrEqual(0)
    expect(bag.recessives.length).toBeLessThanOrEqual(2)
    for (const v of bag.recessives) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is deterministic for the same identity', () => {
    const id = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    const a = generateTraitBag(id)
    const b = generateTraitBag(id)
    expect(a).toEqual(b)
  })

  it('produces a recessive count distribution roughly matching 70/25/5 over many seeds', () => {
    const counts = [0, 0, 0]
    const samples = 2000
    for (let i = 0; i < samples; i++) {
      const id = generateGenesisIdentity('Trifolium repens', i, '0,0')
      counts[generateTraitBag(id).recessives.length]++
    }
    // Sanity bounds — not exact, just "the distribution exists."
    expect(counts[0]).toBeGreaterThan(samples * 0.6)
    expect(counts[0]).toBeLessThan(samples * 0.8)
    expect(counts[1]).toBeGreaterThan(samples * 0.15)
    expect(counts[1]).toBeLessThan(samples * 0.35)
    expect(counts[2]).toBeGreaterThan(samples * 0.01)
    expect(counts[2]).toBeLessThan(samples * 0.1)
  })
})

describe('crossTraitBags', () => {
  const parentA: TraitBag = {
    bloomTiming: 0.2,
    coldTolerance: 0.5,
    droughtResponse: 0.7,
    pollinatorPreference: 0.3,
    recessives: [0.1, 0.9],
  }
  const parentB: TraitBag = {
    bloomTiming: 0.8,
    coldTolerance: 0.5,
    droughtResponse: 0.3,
    pollinatorPreference: 0.7,
    recessives: [0.4],
  }

  it('produces phenotype axes in [0, 1]', () => {
    const rng = createMulberry32(42)
    for (let i = 0; i < 100; i++) {
      const child = crossTraitBags(parentA, parentB, rng)
      expect(child.bloomTiming).toBeGreaterThanOrEqual(0)
      expect(child.bloomTiming).toBeLessThanOrEqual(1)
      expect(child.coldTolerance).toBeGreaterThanOrEqual(0)
      expect(child.coldTolerance).toBeLessThanOrEqual(1)
      expect(child.droughtResponse).toBeGreaterThanOrEqual(0)
      expect(child.droughtResponse).toBeLessThanOrEqual(1)
      expect(child.pollinatorPreference).toBeGreaterThanOrEqual(0)
      expect(child.pollinatorPreference).toBeLessThanOrEqual(1)
    }
  })

  it('produces finite numbers (no NaN)', () => {
    const rng = createMulberry32(42)
    for (let i = 0; i < 100; i++) {
      const child = crossTraitBags(parentA, parentB, rng)
      expect(Number.isFinite(child.bloomTiming)).toBe(true)
      expect(Number.isFinite(child.coldTolerance)).toBe(true)
      expect(Number.isFinite(child.droughtResponse)).toBe(true)
      expect(Number.isFinite(child.pollinatorPreference)).toBe(true)
    }
  })

  it('caps recessives at length 2', () => {
    const rng = createMulberry32(42)
    for (let i = 0; i < 100; i++) {
      const child = crossTraitBags(parentA, parentB, rng)
      expect(child.recessives.length).toBeLessThanOrEqual(2)
    }
  })

  it('handles a parent with empty recessives', () => {
    const emptyParent: TraitBag = { ...parentA, recessives: [] }
    const rng = createMulberry32(42)
    for (let i = 0; i < 50; i++) {
      const child = crossTraitBags(emptyParent, parentB, rng)
      expect(child.recessives.length).toBeLessThanOrEqual(2)
      expect(Number.isFinite(child.bloomTiming)).toBe(true)
    }
  })

  it('handles identical parents (parentA === parentB)', () => {
    const rng = createMulberry32(42)
    for (let i = 0; i < 50; i++) {
      const child = crossTraitBags(parentA, parentA, rng)
      // Phenotype is parent ± Gaussian noise — most draws stay within ~3σ (~0.15) of parent.
      expect(Math.abs(child.bloomTiming - parentA.bloomTiming)).toBeLessThan(0.5)
    }
  })

  it('is deterministic for the same parents + seeded rng', () => {
    const child1 = crossTraitBags(parentA, parentB, createMulberry32(42))
    const child2 = crossTraitBags(parentA, parentB, createMulberry32(42))
    expect(child1).toEqual(child2)
  })
})

describe('hashToHexGrid', () => {
  it('returns an 8x8 grid', () => {
    const id = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    const grid = hashToHexGrid(id)
    expect(grid).toHaveLength(HEX_GRID_SIZE)
    for (const row of grid) {
      expect(row).toHaveLength(HEX_GRID_SIZE)
    }
  })

  it('each cell is a nibble in [0, 15]', () => {
    const id = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    const grid = hashToHexGrid(id)
    for (const row of grid) {
      for (const cell of row) {
        expect(cell).toBeGreaterThanOrEqual(0)
        expect(cell).toBeLessThanOrEqual(15)
        expect(Number.isInteger(cell)).toBe(true)
      }
    }
  })

  // Snapshot pin: the locked mapping rule must never change. Every plant's
  // visible grid in #6's manual derives from this exact mapping; changing it
  // would shift every plant's visible identity across the entire game.
  it('matches pinned snapshot for a known identity', () => {
    const identity = generateGenesisIdentity('Trifolium repens', 12345, '7,7')
    expect(identity).toBe('0e7d7b052690f720498415c0d9c0d36861af3edc5e6d872c2490f2b4a5b8d725')
    const grid = hashToHexGrid(identity)
    expect(grid).toEqual([
      [0, 14, 7, 13, 7, 11, 0, 5],
      [2, 6, 9, 0, 15, 7, 2, 0],
      [4, 9, 8, 4, 1, 5, 12, 0],
      [13, 9, 12, 0, 13, 3, 6, 8],
      [6, 1, 10, 15, 3, 14, 13, 12],
      [5, 14, 6, 13, 8, 7, 2, 12],
      [2, 4, 9, 0, 15, 2, 11, 4],
      [10, 5, 11, 8, 13, 7, 2, 5],
    ])
  })
})
