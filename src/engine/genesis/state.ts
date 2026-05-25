import {
  GENESIS_EGREGORE_BIAS_RADIUS,
  GENESIS_EGREGORE_TILE_COUNT_MAX,
  GENESIS_EGREGORE_TILE_COUNT_MIN,
  GENESIS_FLORA_PATCH_TILES_MAX,
  GENESIS_FLORA_PATCH_TILES_MIN,
  GENESIS_TALL_GRASS_PATCH_COUNT_MAX,
  GENESIS_TALL_GRASS_PATCH_COUNT_MIN,
  GENESIS_WILDFLOWER_PATCH_COUNT_MAX,
  GENESIS_WILDFLOWER_PATCH_COUNT_MIN,
} from '../constants'
import { FLORA_SPECIES } from '../flora/species'
import { createFloraLifecycleEntry } from '../floraLifecycleEntry'
import { generateGenesisIdentity, generateTraitBag } from '../genetics'
import { RuinGenerationMode } from '../genesisTypes'
import { rebuildGlintZones, seedGlintPatches } from '../glintZones'
import { seedOaks } from '../oaks'
import { posKey } from '../position'
import { seedTenureStartFieldCamera } from '../timeLapse'
import { FloraSpecies, TileType } from '../types'

import type { FloraLifecycleState } from '../types'

import type { GenesisEpoch, GenesisResult, GenesisSimState } from '../genesisTypes'
import type { GameState, Tile } from '../types'

import { GENESIS_EPOCHS } from './epochs'
import { clamp } from './shared'

export { GENESIS_EPOCHS } from './epochs'

export const createGenesisState = (
  width: number,
  height: number,
  seed: number,
  ruinGenerationMode: RuinGenerationMode = RuinGenerationMode.Starter
): GenesisSimState => {
  // Import mulberry32 dynamically would break pure engine convention.
  // Inline a simple mulberry32 PRNG here.
  let a = seed | 0
  const rng = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const grid: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ type: TileType.Space }))
  )

  return {
    grid,
    width,
    height,
    soilHealth: new Map(),
    volcanicHeat: new Map(),
    elevation: new Map(),
    ancientSeabeds: new Set(),
    glacialPaths: new Set(),
    riverPaths: new Set(),
    vegetationMap: new Map(),
    burnScars: new Set(),
    ruins: [],
    aqueductNetwork: new Map(),
    aqueductJunctions: [],
    epochIndex: 0,
    epochStartTime: 0,
    lastTickTime: 0,
    rng,
    tileData: new Map(),
    secondFireOccurred: false,
    landMask: new Set(),
    coastlineTiles: new Set(),
    preGlacialVegetation: new Map(),
    glacialEdgeNoise: { top: [], bottom: [] },
    meteorites: [],
    lightningBolts: [],
    satelliteCrashes: [],
    craters: new Set(),
    tectonicAxes: [],
    riverPathsOrdered: [],
    meltPools: new Set(),
    ponds: new Set(),
    lowlandWaterMask: new Set(),
    epochSnapshots: [],
    mutationsPrecomputed: false,
    rainSeed: 0,
    ruinGenerationMode,
    tierTweens: new Map(),
    lastObservedTier: new Map(),
  }
}

export const getGenesisEpochs = (): GenesisEpoch[] => GENESIS_EPOCHS

/** Advance the simulation. Returns true when complete. */
export const tickGenesis = (sim: GenesisSimState, epochs: GenesisEpoch[], time: number): boolean => {
  if (sim.epochIndex >= epochs.length) return true

  sim.lastTickTime = time
  const epoch = epochs[sim.epochIndex]

  // First tick of this epoch — run mutate (skipped if pre-computed).
  if (sim.epochStartTime === 0) {
    sim.epochStartTime = time
    if (!sim.mutationsPrecomputed) {
      epoch.mutate(sim)
    }
  }

  const elapsed = time - sim.epochStartTime
  if (elapsed >= epoch.durationMs) {
    // Advance to next epoch — set epochStartTime to current time so the
    // renderer sees a valid (non-zero) progress on the first frame,
    // preventing a single-frame flash at epoch transitions.
    sim.epochIndex++
    if (sim.epochIndex >= epochs.length) {
      sim.epochStartTime = 0
      return true
    }
    sim.epochStartTime = time
    const nextEpoch = epochs[sim.epochIndex]
    if (!sim.mutationsPrecomputed) {
      nextEpoch.mutate(sim)
    }
  }

  return false
}

export const extractGenesisResult = (sim: GenesisSimState): GenesisResult => ({
  terrain: sim.grid,
  soilHealth: sim.soilHealth,
  elevation: sim.elevation,
  ruins: sim.ruins,
  ponds: sim.ponds,
  rivers: sim.riverPaths,
  burnScars: sim.burnScars,
  craters: sim.craters,
})

// ---------------------------------------------------------------------------
// Multi-species flora post-process (RP-1)
// ---------------------------------------------------------------------------

/**
 * Seed wildflower and tall grass patches on walkable dirt tiles after the
 * epoch chain has stamped the terrain and clover. Mutates `sim.grid` in
 * place (flipping selected dirt tiles to Flora) and returns a Map of
 * floraLifecycle entries the caller installs on the new GameState.
 *
 * Existing Flora tiles from the epoch chain are recorded as species=clover.
 * Wildflower and tall grass tiles get species set on creation. Determinism
 * is preserved because the post-process consumes only `sim.rng` (seeded
 * from the steward name).
 *
 * Per spec RP-1-multi-species-flora:
 *   - clover keeps spreading via the growth-preview system (not here)
 *   - wildflower and tall grass start where genesis places them and do
 *     not self-propagate in this PR
 *   - same steward name → same patch layout
 */
export const postProcessMultiSpeciesFlora = (
  sim: GenesisSimState,
  genesisSeed: number,
): Map<string, FloraLifecycleState> => {
  const lifecycle = new Map<string, FloraLifecycleState>()

  // Record every existing Flora tile from the epoch chain as clover.
  for (let y = 0; y < sim.height; y++) {
    for (let x = 0; x < sim.width; x++) {
      if (sim.grid[y][x].type !== TileType.Flora) continue
      const key = posKey(x, y)
      const species = FloraSpecies.Clover
      const binomial = FLORA_SPECIES[species].latinBinomial
      const identity = generateGenesisIdentity(binomial, genesisSeed, key)
      lifecycle.set(
        key,
        createFloraLifecycleEntry({
          time: 0,
          hasLight: true,
          species,
          identity,
          traits: generateTraitBag(identity),
        }),
      )
    }
  }

  // Collect candidate dirt tiles inside the land mask (excludes space,
  // sand, water, structures). Sort the keys so iteration order is
  // deterministic across JS engines — sim.landMask is a Set and Set
  // iteration order is insertion order, but explicit sort removes any
  // residual ambiguity for the PRNG-driven sampling below.
  const candidates: string[] = []
  for (const key of sim.landMask) {
    if (sim.ponds.has(key)) continue
    if (sim.riverPaths.has(key)) continue
    const [xStr, yStr] = key.split(',')
    const cx = Number(xStr)
    const cy = Number(yStr)
    if (sim.grid[cy][cx].type !== TileType.Dirt) continue
    candidates.push(key)
  }
  candidates.sort()
  if (candidates.length === 0) return lifecycle

  const pickPatchCount = (min: number, max: number): number => min + Math.floor(sim.rng() * (max - min + 1))
  const pickPatchSize = (): number =>
    GENESIS_FLORA_PATCH_TILES_MIN +
    Math.floor(sim.rng() * (GENESIS_FLORA_PATCH_TILES_MAX - GENESIS_FLORA_PATCH_TILES_MIN + 1))

  const used = new Set<string>()
  const placePatch = (species: FloraSpecies): void => {
    if (candidates.length === 0) return
    let seedKey: string | null = null
    for (let attempt = 0; attempt < 40; attempt++) {
      const idx = Math.floor(sim.rng() * candidates.length)
      const key = candidates[idx]
      if (used.has(key)) continue
      seedKey = key
      break
    }
    if (!seedKey) return

    const [sxStr, syStr] = seedKey.split(',')
    const sx = Number(sxStr)
    const sy = Number(syStr)

    const target = pickPatchSize()
    const placed: { x: number; y: number; key: string }[] = []
    const frontier: { x: number; y: number; key: string }[] = [{ x: sx, y: sy, key: seedKey }]
    while (placed.length < target && frontier.length > 0) {
      const idx = Math.floor(sim.rng() * frontier.length)
      const next = frontier.splice(idx, 1)[0]
      if (used.has(next.key)) continue
      if (sim.grid[next.y][next.x].type !== TileType.Dirt) continue
      used.add(next.key)
      placed.push(next)
      // Enqueue 4-neighborhood candidates that are still dirt + unused
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = next.x + dx
        const ny = next.y + dy
        if (nx < 0 || nx >= sim.width || ny < 0 || ny >= sim.height) continue
        const nKey = posKey(nx, ny)
        if (used.has(nKey)) continue
        if (sim.grid[ny][nx].type !== TileType.Dirt) continue
        if (!sim.landMask.has(nKey)) continue
        if (sim.ponds.has(nKey) || sim.riverPaths.has(nKey)) continue
        frontier.push({ x: nx, y: ny, key: nKey })
      }
    }

    const binomial = FLORA_SPECIES[species].latinBinomial
    for (const cell of placed) {
      sim.grid[cell.y][cell.x] = { type: TileType.Flora }
      const identity = generateGenesisIdentity(binomial, genesisSeed, cell.key)
      lifecycle.set(
        cell.key,
        createFloraLifecycleEntry({
          time: 0,
          hasLight: true,
          species,
          identity,
          traits: generateTraitBag(identity),
        }),
      )
    }
  }

  const wildflowerPatches = pickPatchCount(GENESIS_WILDFLOWER_PATCH_COUNT_MIN, GENESIS_WILDFLOWER_PATCH_COUNT_MAX)
  for (let i = 0; i < wildflowerPatches; i++) placePatch(FloraSpecies.Wildflower)

  const tallGrassPatches = pickPatchCount(GENESIS_TALL_GRASS_PATCH_COUNT_MIN, GENESIS_TALL_GRASS_PATCH_COUNT_MAX)
  for (let i = 0; i < tallGrassPatches; i++) placePatch(FloraSpecies.TallGrass)

  return lifecycle
}

/**
 * Genesis post-process for RP-8a — egregoric flora (thematic).
 *
 * Places a small number (GENESIS_EGREGORE_TILE_COUNT_MIN/MAX) of inert
 * TileType.Egregore tiles on walkable dirt, biased toward positions near
 * sim.craters (meteorite impact sites). Per v3 doctrine: "~3 tiles
 * placed by genesis, biased near meteorite spawns."
 *
 * Determinism: same nameToSeed → same egregore positions. The sampling
 * uses sim.rng directly (after the multi-species flora pass has run, so
 * the PRNG state is shared but deterministic across the chain).
 *
 * Returns the placed positions so callers can use them to seed manual
 * entries / discovery records.
 */
export const postProcessEgregoreTiles = (sim: GenesisSimState): { x: number; y: number }[] => {
  const placed: { x: number; y: number }[] = []

  // Two-phase candidate list:
  //   1. Crater-adjacent dirt within GENESIS_EGREGORE_BIAS_RADIUS
  //   2. Any walkable dirt (fallback if no craters or no crater-adjacent dirt)
  const used = new Set<string>()
  const isPlaceable = (x: number, y: number, key: string): boolean => {
    if (used.has(key)) return false
    if (x < 0 || x >= sim.width || y < 0 || y >= sim.height) return false
    if (!sim.landMask.has(key)) return false
    if (sim.ponds.has(key)) return false
    if (sim.riverPaths.has(key)) return false
    return sim.grid[y][x].type === TileType.Dirt
  }

  // Phase 1: collect crater-adjacent candidates.
  const craterAdjacent: string[] = []
  for (const craterKey of sim.craters) {
    const [cxStr, cyStr] = craterKey.split(',')
    const cx = Number(cxStr)
    const cy = Number(cyStr)
    for (let dy = -GENESIS_EGREGORE_BIAS_RADIUS; dy <= GENESIS_EGREGORE_BIAS_RADIUS; dy++) {
      for (let dx = -GENESIS_EGREGORE_BIAS_RADIUS; dx <= GENESIS_EGREGORE_BIAS_RADIUS; dx++) {
        const nx = cx + dx
        const ny = cy + dy
        const nKey = posKey(nx, ny)
        if (isPlaceable(nx, ny, nKey)) craterAdjacent.push(nKey)
      }
    }
  }
  // Dedupe + sort for determinism. Sets keep insertion order in JS but
  // we want byte-stable ordering across engines.
  const uniqueAdjacent = Array.from(new Set(craterAdjacent)).sort()

  // Phase 2: full dirt fallback.
  const allDirt: string[] = []
  for (const key of sim.landMask) {
    const [xStr, yStr] = key.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    if (isPlaceable(x, y, key)) allDirt.push(key)
  }
  allDirt.sort()

  const target =
    GENESIS_EGREGORE_TILE_COUNT_MIN +
    Math.floor(sim.rng() * (GENESIS_EGREGORE_TILE_COUNT_MAX - GENESIS_EGREGORE_TILE_COUNT_MIN + 1))

  const pickFrom = (pool: string[]): string | null => {
    if (pool.length === 0) return null
    for (let attempt = 0; attempt < 20; attempt++) {
      const idx = Math.floor(sim.rng() * pool.length)
      const key = pool[idx]
      if (!used.has(key)) return key
    }
    return null
  }

  for (let i = 0; i < target; i++) {
    const pick = pickFrom(uniqueAdjacent) ?? pickFrom(allDirt)
    if (!pick) break
    used.add(pick)
    const [xStr, yStr] = pick.split(',')
    const x = Number(xStr)
    const y = Number(yStr)
    sim.grid[y][x] = { type: TileType.Egregore }
    placed.push({ x, y })
  }

  return placed
}

export interface CompleteGenesisOptions {
  // When true (dev ?skipGenesis=true), skip scheduling the boot title
  // card so the player lands directly in gameplay with no overlay.
  skipTitleCard?: boolean
}

export const completeGenesis = (state: GameState, options: CompleteGenesisOptions = {}): void => {
  if (!state.genesis) return

  // If genesis wasn't fully played out, run remaining mutations
  const sim = state.genesis
  if (sim.epochIndex < GENESIS_EPOCHS.length) {
    if (!sim.mutationsPrecomputed) {
      runAllMutations(sim, GENESIS_EPOCHS)
    }
    sim.epochIndex = GENESIS_EPOCHS.length
  }

  if (options.skipTitleCard) {
    // Dev fast-path: hand off immediately, no title card cover.
    finalizeGenesisHandoff(state, performance.now())
    return
  }

  // Schedule the title card. The genesis renderer keeps painting until
  // finalizeGenesisHandoff fires at the title card's hold midpoint —
  // that way the renderer swap is invisible under the full-black cover.
  state.bootTitleCard = {
    startTime: performance.now(),
    label: 'Revery Prairie',
  }
}

/**
 * Final genesis→gameplay swap. Clears state.genesis, seeds glint
 * patches with the handoff timestamp, and triggers the player spawn
 * meteor. Called either synchronously by completeGenesis (skip path)
 * or by gameLoop at the title card's hold midpoint.
 */
export const finalizeGenesisHandoff = (state: GameState, handoffTime: number): void => {
  if (!state.genesis) return

  // Seed glinting zone patches now, using the handoff time as the
  // birth-time baseline so every patch starts in fade-in (opacity 0)
  // on the first gameplay frame. Seeding earlier (in createGameState)
  // would let patches age through the ~25s of genesis and pop in at
  // full opacity once the gameplay renderer takes over.
  seedGlintPatches(state, handoffTime)
  rebuildGlintZones(state, handoffTime)

  // Scatter oaks across the prairie at deterministic positions.
  seedOaks(state, handoffTime)

  // Precis #23 v9 R3 — once oaks exist, drop the inherited Field
  // Camera adjacent to the oak nearest the little house entrance,
  // exhausted, with four pre-seeded seasonal frames.
  seedTenureStartFieldCamera(state)

  // Hand off to the gameplay layer to trigger the player spawn ceremony
  // synchronously. Without this, the gameloop's player-spawn-trigger
  // (gameplay phase) fires one tick later than the first gameplay render —
  // that one-frame gap drew the @ glyph at the spawn tile before the
  // meteorite descent began.
  state.onGenesisComplete?.(handoffTime)

  state.genesis = null
}

/** The year at which genesis ends and gameplay begins. Read by the
 *  deep-time year display in Sidebar.tsx as the gameplay-now anchor. */
export const GENESIS_END_YEAR = 13_800_000_000

/** Format a year as a comma-separated integer string (e.g. 13_800_000_000 →
 *  "13,800,000,000"). Used by the deep-time gameplay year display, which
 *  is forward-projecting. */
export const formatYear = (year: number): string => year.toLocaleString()

export const getEpochProgress = (sim: GenesisSimState, epochs: GenesisEpoch[]): number => {
  if (sim.epochIndex >= epochs.length) return 1
  const epoch = epochs[sim.epochIndex]
  if (sim.epochStartTime === 0) return 0
  // Use lastTickTime (set by tickGenesis from the rAF clock) instead of
  // performance.now() so the tick and render share the same time source.
  // This prevents near-zero progress on the first frame of a new epoch.
  const now = sim.lastTickTime > 0 ? sim.lastTickTime : performance.now()
  return clamp((now - sim.epochStartTime) / epoch.durationMs, 0, 1)
}

/** Run all epoch mutations synchronously (for skip / tests). */
export const runAllMutations = (sim: GenesisSimState, epochs: GenesisEpoch[]): void => {
  for (const epoch of epochs) {
    epoch.mutate(sim)
  }
  sim.epochIndex = epochs.length
}

/** Pre-compute all epoch mutations and take per-epoch snapshots for stall-free playback. */
export const precomputeGenesis = (sim: GenesisSimState, epochs: GenesisEpoch[]): void => {
  for (const epoch of epochs) {
    epoch.mutate(sim)
    sim.epochSnapshots.push({
      vegetationMap: new Map(sim.vegetationMap),
      riverPaths: new Set(sim.riverPaths),
      ponds: new Set(sim.ponds),
      elevation: new Map(sim.elevation),
      volcanicHeat: new Map(sim.volcanicHeat),
      ancientSeabeds: new Set(sim.ancientSeabeds),
      burnScars: new Set(sim.burnScars),
      meteorites: [...sim.meteorites],
      lightningBolts: [...sim.lightningBolts],
      preGlacialVegetation: new Map(sim.preGlacialVegetation),
      glacialPaths: new Set(sim.glacialPaths),
      meltPools: new Set(sim.meltPools),
      tileData: new Map(sim.tileData),
      aqueductNetwork: new Map(sim.aqueductNetwork),
      ruins: [...sim.ruins],
      satelliteCrashes: [...sim.satelliteCrashes],
      craters: new Set(sim.craters),
      tectonicAxes: sim.tectonicAxes.map(a => ({
        polyline: a.polyline.map(p => ({ x: p.x, y: p.y })),
        orientationRadians: a.orientationRadians,
        intensity: a.intensity,
        radius: a.radius,
      })),
      lowlandWaterMask: new Set(sim.lowlandWaterMask),
    })
  }
  sim.mutationsPrecomputed = true
  sim.epochIndex = 0
  sim.epochStartTime = 0
}

// Re-export connectivity helper from shared so external callers
// (tests, etc.) can still import it from '../genesis'.
export { enforceConnectivity } from './shared'

// Re-export naming utility (nameToSeed) so external callers can still
// import it from '../genesis'.
export { nameToSeed } from './shared'
