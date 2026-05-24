// RP-17 — species-agnostic flora spread engine.
//
// Detects connected patches of a target species, hands them to a
// per-species selector to choose preview targets, and commits previews
// to flora tiles on the next tick. Lineage propagates through the
// child identity's derivation seed (parent prefix → child prefix).
// Bee-mediated crosses fire here too: when a parent tile has
// primedPollen set, the child's traits come from crossTraitBags and a
// crossDonorPrefix is recorded.
//
// Per-species behavior lives in SpeciesSpreadConfig (see
// ./spreadConfig.ts) — there are no clover/wildflower/tallgrass
// branches in this file. New species are added by writing a config
// under flora/type/<species>/spread.ts and wiring it into the game
// loop.

import { FLORA_SPECIES } from '@/engine/flora/species'
import { getGrowthPreviewSet } from '@/engine/floraGrowthPreviews'
import { createFloraLifecycleEntry } from '@/engine/floraLifecycleEntry'
import { crossTraitBags, generateRuntimeIdentity, generateTraitBag } from '@/engine/genetics'
import { recordDiscovery } from '@/engine/manual'
import { setMapTile } from '@/engine/map'
import { CARDINAL, isInBounds, posKey } from '@/engine/position'
import { getStoneCircleGraph, segmentCrossesAnyMeteoriteEdge } from '@/engine/stoneCircles'
import { FloraSpecies, Season, TileType } from '@/engine/types'
import type { FloraPatch, SpeciesSpreadConfig } from './spreadConfig'
import type { TraitBag } from '@/engine/genetics'
import type { FloraLifecycleState, GameState, Position } from '@/engine/types'

// Mulberry32 PRNG keyed off the first 8 hex chars of a SHA identity.
// Same shape as the helper in genetics/index.ts (kept private there);
// we need a public-to-this-module instance for crossTraitBags rng.
const createMulberry32 = (seed: number): (() => number) => {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const identityToSeed = (identity: string): number => parseInt(identity.slice(0, 8), 16) >>> 0

const isSpeciesTile = (state: GameState, x: number, y: number, species: FloraSpecies): boolean => {
  if (state.map[y]?.[x]?.type !== TileType.Flora) return false
  return state.floraLifecycle.get(posKey(x, y))?.species === species
}

// --- Patch detection ---

// Generic flood-fill: returns all connected patches of the given species.
// Patches are CARDINAL-connected (matches the legacy clover flood-fill).
export const floodFillFloraPatches = (state: GameState, species: FloraSpecies): FloraPatch[] => {
  const visited = new Set<string>()
  const patches: FloraPatch[] = []
  const w = state.mapWidth
  const h = state.mapHeight

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isSpeciesTile(state, x, y, species)) continue
      const startKey = posKey(x, y)
      if (visited.has(startKey)) continue

      const tiles = new Set<string>()
      const queue: Position[] = [{ x, y }]
      let sumX = 0
      let sumY = 0

      while (queue.length > 0) {
        const pos = queue.shift()
        if (!pos) continue
        const key = posKey(pos.x, pos.y)
        if (visited.has(key)) continue
        visited.add(key)
        tiles.add(key)
        sumX += pos.x
        sumY += pos.y

        for (const d of CARDINAL) {
          const nx = pos.x + d.x
          const ny = pos.y + d.y
          if (!isInBounds(nx, ny, w, h)) continue
          if (!isSpeciesTile(state, nx, ny, species)) continue
          const nk = posKey(nx, ny)
          if (!visited.has(nk)) {
            queue.push({ x: nx, y: ny })
          }
        }
      }

      patches.push({
        tiles,
        centroid: { x: sumX / tiles.size, y: sumY / tiles.size },
        beeCount: 0,
      })
    }
  }

  return patches
}

// --- Lineage helper ---

// Produces the child's identity by feeding a synthetic binomial that
// encodes the parent's first 8 hex chars into generateRuntimeIdentity.
// Descendants share family-resemblance regions in the identity-derived
// hex grid because the SHA input contains the parent's prefix.
// Traits are generated fresh from the child identity — drift is
// implicit in the hash, there's no separate mutation step.
//
// Crossed offspring (parent had primedPollen) take a different code
// path inside commitFloraPreviews and bypass this helper for traits;
// they still get their identity from a synthetic binomial of the form
// `${binomial}:spread:${parent8}:crossed:${donor8}`.
export const applyParentLineage = (
  parentIdentity: string | undefined,
  binomial: string,
  childKey: string,
  time: number
): { identity: string; traits: TraitBag } => {
  const parentPrefix = parentIdentity?.slice(0, 8) ?? 'genesis'
  const lineageBinomial = `${binomial}:spread:${parentPrefix}`
  const identity = generateRuntimeIdentity(lineageBinomial, childKey, time)
  const traits = generateTraitBag(identity)
  return { identity, traits }
}

// Find the same-species CARDINAL parent of a candidate tile. Returns
// the parent posKey of lowest lexicographic order so the choice is
// deterministic across runs. Returns undefined for orphaned previews
// (parent died and decomposed in the same tick the preview committed).
const findParentKey = (state: GameState, x: number, y: number, species: FloraSpecies): string | undefined => {
  let parent: string | undefined
  for (const d of CARDINAL) {
    const nx = x + d.x
    const ny = y + d.y
    if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
    if (!isSpeciesTile(state, nx, ny, species)) continue
    const key = posKey(nx, ny)
    if (parent === undefined || key < parent) parent = key
  }
  return parent
}

// --- Phase 1 commit ---

// Walks the per-species preview Set, converts each previewed tile to
// a Flora tile of the target species, and assigns identity + traits
// per the lineage rules. Returns true if any preview committed.
// Clears the preview Set on exit.
export const commitFloraPreviews = (state: GameState, species: FloraSpecies, time: number): boolean => {
  const previews = getGrowthPreviewSet(state, species)
  if (previews.size === 0) return false

  const binomial = FLORA_SPECIES[species].latinBinomial
  let committed = false

  // RP-18 wall semantics — flora cannot spread across a meteorite-
  // pair edge any more than egregoric flora can. Compute the edge set
  // once and skip any preview whose parent→child segment crosses one.
  const placed = state.placedMeteorites
  const edges = placed.length >= 2 ? getStoneCircleGraph(placed) : []

  for (const key of previews) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) continue
    if (state.map[y][x].type !== TileType.Dirt) continue

    const parentKey = findParentKey(state, x, y, species)
    if (edges.length > 0 && parentKey !== undefined) {
      const [pxs, pys] = parentKey.split(',')
      const parentX = Number(pxs)
      const parentY = Number(pys)
      if (segmentCrossesAnyMeteoriteEdge(placed, edges, parentX, parentY, x, y)) continue
    }
    const parent = parentKey !== undefined ? state.floraLifecycle.get(parentKey) : undefined
    const parentIdentity = parent?.identity

    let identity: string
    let traits: TraitBag
    let crossDonorPrefix: string | undefined
    const parentPrefix = parentIdentity?.slice(0, 8)

    if (parent?.primedPollen) {
      // Crossed offspring: identity encodes both parents' prefixes,
      // traits come from crossTraitBags with rng seeded by the child's
      // own identity. Donor prefix is recorded on the child for the
      // lineage overlay's dashed second edge.
      const donor = parent.primedPollen
      const donor8 = donor.identity.slice(0, 8)
      const parent8 = parentIdentity?.slice(0, 8) ?? 'genesis'
      const lineageBinomial = `${binomial}:spread:${parent8}:crossed:${donor8}`
      identity = generateRuntimeIdentity(lineageBinomial, key, time)
      const rng = createMulberry32(identityToSeed(identity))
      traits = crossTraitBags(parent.traits, donor.traits, rng)
      crossDonorPrefix = donor8
      // One cross per priming. The parent can be re-primed later by
      // another bee visit, and the next spread can cross again.
      parent.primedPollen = undefined
    } else {
      const out = applyParentLineage(parentIdentity, binomial, key, time)
      identity = out.identity
      traits = out.traits
    }

    setMapTile(state, x, y, { type: TileType.Flora })
    const entry: FloraLifecycleState = createFloraLifecycleEntry({
      time: 0,
      hasLight: true,
      species,
      identity,
      traits,
    })
    if (crossDonorPrefix !== undefined) entry.crossDonorPrefix = crossDonorPrefix
    if (parentPrefix !== undefined) entry.parentPrefix = parentPrefix
    state.floraLifecycle.set(key, entry)
    committed = true
  }

  previews.clear()
  return committed
}

// --- Engine entrypoint ---

// One scheduled tick of spread for the given species. Phase 1 commits
// any pending previews (from the prior tick); phase 2 detects patches
// and queues new previews via the selector. Winter dormancy bails
// before phase 2 — phase 1 still runs so any in-flight previews land
// rather than silently dropping.
export const tickSpeciesSpread = (state: GameState, time: number, config: SpeciesSpreadConfig): void => {
  const previews = getGrowthPreviewSet(state, config.species)

  if (config.winterDormant && state.weather.season === Season.Winter) {
    if (previews.size > 0) previews.clear()
    return
  }

  const grew = commitFloraPreviews(state, config.species, time)

  // Phase 2: detect patches, run selector, queue previews.
  const patches = floodFillFloraPatches(state, config.species)
  const selected = config.selectGrowthTargets(state, patches)
  for (const positions of selected.values()) {
    for (const pos of positions) {
      previews.add(posKey(pos.x, pos.y))
    }
  }

  if (grew) {
    recordDiscovery(state, config.discoveryEventOnGrowth)
    recordDiscovery(state, 'event:flora-spread')
  }
}
