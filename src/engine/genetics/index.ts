// Precis #3 — Genetics v1.
//
// SHA256 identity (via sha256Sync from crypto.ts) + trait bag inheritance.
// All functions in this module are pure. No callers exist in #3 itself
// beyond identity + trait generation at flora construction sites — the
// crossing and hex-grid functions ship tested but unwired, ready for
// #6 (manual) and #12 (crossbreeding).
//
// The 8×8 hex grid mapping rule is LOCKED: cell[row][col] is the nibble
// at position row * 8 + col in the SHA256 hex string. Every plant's
// visible grid in #6 derives from this exact rule and must stay stable
// across game versions.

import { sha256Sync } from '@/engine/crypto'

// --- Types ---

export interface TraitBag {
  bloomTiming: number
  coldTolerance: number
  droughtResponse: number
  pollinatorPreference: number
  // 0-2 recessive values that do not manifest in the plant's own phenotype
  // but can pass to offspring. Index 0 corresponds to bloomTiming, index 1
  // to coldTolerance, etc. — but recessives.length need not equal 4. The
  // array is permitted to be empty.
  recessives: number[]
}

export type HexGrid = number[][]

export interface FloraGenome {
  identity: string
  traits: TraitBag
}

// --- Internal PRNG ---

// mulberry32 — pure, deterministic, 32-bit. Same impl as genesis.ts:3236.
const createMulberry32 = (seed: number): (() => number) => {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Seed extraction: first 8 hex chars of an identity → 32-bit unsigned int.
const identityToSeed = (identity: string): number => parseInt(identity.slice(0, 8), 16) >>> 0

// Box-Muller for Gaussian noise (σ = 0.05 used in crossing math).
const gaussian = (rng: () => number, sigma: number): number => {
  const u1 = rng()
  const u2 = rng()
  // Guard against log(0) — mulberry32 can return 0 exactly.
  const safe = u1 === 0 ? Number.MIN_VALUE : u1
  return Math.sqrt(-2 * Math.log(safe)) * Math.cos(2 * Math.PI * u2) * sigma
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

// --- Identity generation ---

// Genesis-placed flora: stable per (species, world, position).
export const generateGenesisIdentity = (binomial: string, genesisSeed: number, posKey: string): string =>
  sha256Sync(`${binomial}:${String(genesisSeed)}:${posKey}`)

// Post-genesis flora (clover-by-bee, monarch wildflower, recipe flora, etc.).
// Includes time so re-growths on a recycled tile receive a fresh identity.
export const generateRuntimeIdentity = (binomial: string, posKey: string, time: number): string =>
  sha256Sync(`runtime:${binomial}:${posKey}:${String(time)}`)

// --- Trait bag generation ---

// Recessive count distribution: 70% / 25% / 5% for 0 / 1 / 2.
const rollRecessiveCount = (rng: () => number): number => {
  const r = rng()
  if (r < 0.7) return 0
  if (r < 0.95) return 1
  return 2
}

export const generateTraitBag = (identity: string): TraitBag => {
  const rng = createMulberry32(identityToSeed(identity))
  const bloomTiming = rng()
  const coldTolerance = rng()
  const droughtResponse = rng()
  const pollinatorPreference = rng()
  const recessiveCount = rollRecessiveCount(rng)
  const recessives: number[] = []
  for (let i = 0; i < recessiveCount; i++) {
    recessives.push(rng())
  }
  return { bloomTiming, coldTolerance, droughtResponse, pollinatorPreference, recessives }
}

// --- Crossing math ---

// Phenotype axes in canonical order. Used by crossTraitBags' novelty roll.
const PHENOTYPE_AXES = ['bloomTiming', 'coldTolerance', 'droughtResponse', 'pollinatorPreference'] as const
type PhenotypeAxis = (typeof PHENOTYPE_AXES)[number]

const NOVELTY_PROBABILITY = 0.02
const PHENOTYPE_NOISE_SIGMA = 0.05
const RECESSIVE_INHERITANCE_PROBABILITY = 0.5
const MAX_RECESSIVES = 2

export const crossTraitBags = (parentA: TraitBag, parentB: TraitBag, rng: () => number): TraitBag => {
  // Phenotype: average + Gaussian noise, clamped to [0, 1].
  const draws: Record<PhenotypeAxis, number> = {
    bloomTiming: clamp01((parentA.bloomTiming + parentB.bloomTiming) / 2 + gaussian(rng, PHENOTYPE_NOISE_SIGMA)),
    coldTolerance: clamp01((parentA.coldTolerance + parentB.coldTolerance) / 2 + gaussian(rng, PHENOTYPE_NOISE_SIGMA)),
    droughtResponse: clamp01((parentA.droughtResponse + parentB.droughtResponse) / 2 + gaussian(rng, PHENOTYPE_NOISE_SIGMA)),
    pollinatorPreference: clamp01(
      (parentA.pollinatorPreference + parentB.pollinatorPreference) / 2 + gaussian(rng, PHENOTYPE_NOISE_SIGMA)
    ),
  }

  // Novelty roll: 2% chance one axis is re-drawn uniformly in [0, 1).
  if (rng() < NOVELTY_PROBABILITY) {
    const axisIndex = Math.floor(rng() * PHENOTYPE_AXES.length)
    const axis = PHENOTYPE_AXES[axisIndex]
    draws[axis] = rng()
  }

  // Recessives: each parent slot has 50% chance to pass to child. Capped at 2.
  const recessives: number[] = []
  for (const value of parentA.recessives) {
    if (recessives.length >= MAX_RECESSIVES) break
    if (rng() < RECESSIVE_INHERITANCE_PROBABILITY) recessives.push(value)
  }
  for (const value of parentB.recessives) {
    if (recessives.length >= MAX_RECESSIVES) break
    if (rng() < RECESSIVE_INHERITANCE_PROBABILITY) recessives.push(value)
  }

  return {
    bloomTiming: draws.bloomTiming,
    coldTolerance: draws.coldTolerance,
    droughtResponse: draws.droughtResponse,
    pollinatorPreference: draws.pollinatorPreference,
    recessives,
  }
}

// --- Hex grid derivation ---

// LOCKED MAPPING: cell[row][col] = parseInt(identity[row * 8 + col], 16).
// 8x8 grid, 1 nibble per cell, values in [0, 15].
// Do not change. Every plant's visible grid in #6 depends on this.
export const HEX_GRID_SIZE = 8

export const hashToHexGrid = (identity: string): HexGrid => {
  const grid: HexGrid = []
  for (let row = 0; row < HEX_GRID_SIZE; row++) {
    const rowValues: number[] = []
    for (let col = 0; col < HEX_GRID_SIZE; col++) {
      rowValues.push(parseInt(identity[row * HEX_GRID_SIZE + col], 16))
    }
    grid.push(rowValues)
  }
  return grid
}
