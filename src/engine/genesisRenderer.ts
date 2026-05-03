import {
  BG_COLOR,
  LIGHTNING_SCREEN_FLASH_MS,
  LIGHTNING_SCREEN_FLASH_OPACITY,
  RUIN_ENTRANCE_HALO_COLOR,
} from './constants'
import { getEpochProgress } from './genesis'
import { GenesisEpochId } from './genesisTypes'
import { posKey, tileHash } from './position'
import { drawCellBackground, drawCellWalls, viewportToScreen } from './projection'
import { getEntranceHaloCells } from './ruins'
import {
  ELEVATION_TIER_COUNT,
  ELEVATION_TIER_LIFT_PX,
  WALL_LEFT_SHADE,
  WALL_RIGHT_SHADE,
  darkenColor,
  getElevationTier,
  getPondBgColor,
  getRiverBgColor,
  getTierLift,
  getTileBgColor,
} from './tileBg'
import { TileType } from './types'
import { getVisibleTileBounds, isTileInVisibleViewport } from './viewportBounds'

import type { EpochSnapshot, GenesisEpoch, GenesisSimState, GenesisTileRender } from './genesisTypes'
import type { CharMetrics } from './types'

// Cosmetic terrain elevation. Reads sim.elevation (mutated live by
// epochs like glaciation and warmPeriod), maps to a discrete tier, and
// returns the y-offset that lifts the tile's diamond up the screen.
const tierAtSim = (sim: GenesisSimState, mx: number, my: number): number =>
  getElevationTier(sim.elevation.get(posKey(mx, my)))

const liftAtSim = (sim: GenesisSimState, mx: number, my: number): number =>
  getTierLift(tierAtSim(sim, mx, my))

// Lowland water predicate: matches renderLowlandWater in genesis.ts —
// elev + per-tile scatter < 40 over a land tile. Used so the bg fill
// paints water-blue under elevation-based lowland water glyphs (which
// the various epoch renderTile functions emit) instead of brown dirt.
const isLowlandWater = (sim: GenesisSimState, key: string, h: number): boolean => {
  if (!sim.landMask.has(key)) return false
  const elev = sim.elevation.get(key) ?? 50
  const scatter = (h % 25) - 12 + (((h >>> 8) % 15) - 7)
  return elev + scatter < 40
}

// Genesis water lives in three buckets: sim.riverPaths (mature rivers),
// sim.ponds (pooled basins), and the elevation-based lowland predicate
// (early aquatic phase before rivers/ponds are materialized).
//
// `includeLowland` lets the caller scope the predicate. presentDay must
// match gameplay tileBgCache exactly, and gameplay only knows about
// state.rivers / state.ponds — so presentDay calls this with
// includeLowland=false. Earlier epochs (firstWater through
// fallOfCivilizations) include the lowland predicate so the surface
// reads as water during the aquatic phase before rivers are carved.
const getWaterBgColor = (
  sim: GenesisSimState,
  mx: number,
  my: number,
  key: string,
  h: number,
  includeLowland: boolean,
): string | null => {
  if (sim.riverPaths.has(key)) return getRiverBgColor(mx, my)
  if (sim.ponds.has(key)) return getPondBgColor(mx, my)
  if (includeLowland && isLowlandWater(sim, key, h)) return getRiverBgColor(mx, my)
  return null
}

// Surface-bg darkening for non-presentDay epochs: TILE_BG_PALETTES are
// roughly 0.55-0.65 of TILE_COLORS' brightness. We darken the epoch's
// glyph color by 0.45 to land in the same readable "glyph on darker
// surface" zone for lava, ice, glacial paths, fire, etc.
const SURFACE_BG_DARKEN = 0.45

const toHexColor = (color: string): string => {
  if (color.startsWith('#')) {
    if (color.length === 4) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    }
    return color
  }
  const [r, g, b] = parseColor(color)
  const toHex = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Epochs that should NOT paint any tile-bg diamond fill, skirt, or
// cube walls — their visuals are stars / cosmic dust on the canvas
// BG_COLOR, so a brown/lava/etc diamond would look like a floating
// landmass in the void. Lift still applies for elevation but the
// underlying canvas color shows through.
const SKIP_BG_EPOCHS = new Set<GenesisEpochId>([
  GenesisEpochId.CosmicFormation,
  GenesisEpochId.LandAccretion,
])

// Epochs whose renderTile actually paints lowland water (firstWater
// through warmPeriod). The bg fill applies the lowland predicate only
// in these epochs so it matches what the glyph layer is showing. Other
// epochs either pre-date water (lavaEra / crustCooling) or have
// consolidated water into the explicit sim.riverPaths / sim.ponds sets
// (riseOfCivilizations / fallOfCivilizations / presentDay) — applying
// the lowland predicate there would paint blue diamonds under lava /
// civilization tiles that the glyph layer never treats as water.
const LOWLAND_WATER_EPOCHS = new Set<GenesisEpochId>([
  GenesisEpochId.FirstWater,
  GenesisEpochId.EmergenceOfLife,
  GenesisEpochId.FireSeason,
  GenesisEpochId.Regrowth,
  GenesisEpochId.IceAge,
  GenesisEpochId.PostGlacialDieOff,
  GenesisEpochId.WarmPeriod,
])

// Returns the surface bg color for a tile in the given epoch, or null
// when the epoch is in SKIP_BG_EPOCHS or the tile has no glyph color.
//   PresentDay: match gameplay tileBgCache exactly (TILE_BG_PALETTES via
//     getTileBgColor, with rivers/ponds water overrides — NOT the
//     elevation lowland predicate, since gameplay doesn't track lowland
//     water and would snap to dirt-brown at the handoff).
//   Other epochs: water tiles (rivers/ponds/lowland) use the river/pond
//     palette directly so blue is stable across the freeze/unfreeze
//     transition in iceAge → postGlacial → warmPeriod (otherwise the
//     darken-from-glyph path would slam very-dark-blue against
//     light-blue ice and produce a jarring boundary). Non-water tiles
//     derive bg from the epoch's primary glyph color, darkened.
//   `surfaceColor` is the precomputed first-render color for this tile in
//   this epoch — the caller already has it from the renderTile cache, so
//   we don't recompute renderTile here.
const computeSurfaceBg = (
  sim: GenesisSimState,
  epochId: GenesisEpochId,
  mx: number,
  my: number,
  tileType: TileType,
  surfaceColor: string | undefined,
): string | null => {
  if (SKIP_BG_EPOCHS.has(epochId)) return null
  const key = posKey(mx, my)
  const h = tileHash(mx, my)
  if (epochId === GenesisEpochId.PresentDay) {
    return getWaterBgColor(sim, mx, my, key, h, false) ?? getTileBgColor(tileType, mx, my)
  }
  const water = getWaterBgColor(sim, mx, my, key, h, LOWLAND_WATER_EPOCHS.has(epochId))
  if (water) return water
  if (!surfaceColor) return getTileBgColor(tileType, mx, my)
  return darkenColor(toHexColor(surfaceColor), SURFACE_BG_DARKEN)
}

// Max possible negative lift: tier 3 * ELEVATION_TIER_LIFT_PX.
// Used to expand the off-canvas cull margin so high-tier tiles near the
// viewport top edge remain in the iteration window.
const MAX_LIFT_PX = (ELEVATION_TIER_COUNT - 1) * ELEVATION_TIER_LIFT_PX

// Cross-fade window: last 10% of each epoch blends into the next
const CROSSFADE_START = 0.9
// How far into the next epoch we peek during cross-fade. At blendT=1 the
// next epoch renders at this progress value, which closely matches what it
// will show when it actually starts (progress near 0). Without this, the
// cross-fade shows the next epoch at progress=blendT→1 (fully complete),
// then the epoch starts at progress≈0, causing a visual snap.
const CROSSFADE_PEEK = 0.05

/** Parse a color string (#RGB, #RRGGBB, or rgb(r,g,b)) into [r, g, b]. */
const parseColor = (color: string): [number, number, number] => {
  if (color.startsWith('rgb')) {
    const match = /(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color)
    if (match) return [Number(match[1]), Number(match[2]), Number(match[3])]
    return [0, 0, 0]
  }
  const h = color.startsWith('#') ? color.slice(1) : color
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
  }
  const n = parseInt(h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** Lerp two color strings (hex or rgb()), returning an rgb() string. */
const lerpColor = (from: string, to: string, t: number): string => {
  const [fr, fg, fb] = parseColor(from)
  const [tr, tg, tb] = parseColor(to)
  const r = Math.round(fr + (tr - fr) * t)
  const g = Math.round(fg + (tg - fg) * t)
  const b = Math.round(fb + (tb - fb) * t)
  return `rgb(${String(r)},${String(g)},${String(b)})`
}

/** Decide how visible the ruin-entrance halo should be in the current frame.
 *  Invisible during earlier epochs (their visuals would conflict), fades in
 *  during the fallOfCivilizations -> presentDay crossfade, and holds at full
 *  opacity once presentDay is the active epoch. */
const computeHaloAlpha = (
  epochIndex: number,
  currentEpochId: GenesisEpochId,
  blendT: number,
  nextEpochId: GenesisEpochId | undefined,
): number => {
  if (currentEpochId === GenesisEpochId.PresentDay) return 1
  if (epochIndex >= 0 && currentEpochId === GenesisEpochId.FallOfCivilizations
      && nextEpochId === GenesisEpochId.PresentDay) {
    return blendT
  }
  return 0
}

/** Capture a snapshot of all mutable sim fields that renderTile reads. */
const captureLiveState = (sim: GenesisSimState): EpochSnapshot => ({
  vegetationMap: sim.vegetationMap,
  riverPaths: sim.riverPaths,
  ponds: sim.ponds,
  elevation: sim.elevation,
  volcanicHeat: sim.volcanicHeat,
  ancientSeabeds: sim.ancientSeabeds,
  burnScars: sim.burnScars,
  meteorites: sim.meteorites,
  lightningBolts: sim.lightningBolts,
  preGlacialVegetation: sim.preGlacialVegetation,
  glacialPaths: sim.glacialPaths,
  meltPools: sim.meltPools,
  tileData: sim.tileData,
  aqueductNetwork: sim.aqueductNetwork,
  ruins: sim.ruins,
  satelliteCrashes: sim.satelliteCrashes,
  craters: sim.craters,
  tectonicAxes: sim.tectonicAxes,
})

/** Swap all mutable sim fields to match a snapshot. */
const applySnapshot = (sim: GenesisSimState, snapshot: EpochSnapshot): void => {
  sim.vegetationMap = snapshot.vegetationMap
  sim.riverPaths = snapshot.riverPaths
  sim.ponds = snapshot.ponds
  sim.elevation = snapshot.elevation
  sim.volcanicHeat = snapshot.volcanicHeat
  sim.ancientSeabeds = snapshot.ancientSeabeds
  sim.burnScars = snapshot.burnScars
  sim.meteorites = snapshot.meteorites
  sim.lightningBolts = snapshot.lightningBolts
  sim.preGlacialVegetation = snapshot.preGlacialVegetation
  sim.glacialPaths = snapshot.glacialPaths
  sim.meltPools = snapshot.meltPools
  sim.tileData = snapshot.tileData
  sim.aqueductNetwork = snapshot.aqueductNetwork
  sim.ruins = snapshot.ruins
  sim.satelliteCrashes = snapshot.satelliteCrashes
  sim.craters = snapshot.craters
  sim.tectonicAxes = snapshot.tectonicAxes
}

/** Render one frame of the genesis simulation. */
export const renderGenesis = (
  ctx: CanvasRenderingContext2D,
  sim: GenesisSimState,
  epochs: GenesisEpoch[],
  metrics: CharMetrics,
  viewportWidth: number,
  viewportHeight: number,
  time: number
): void => {
  const { charWidth, charHeight } = metrics

  // Clear canvas
  const canvasWidth = viewportWidth * charWidth
  const canvasHeight = viewportHeight * charHeight
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  if (sim.epochIndex >= epochs.length) return

  const epoch = epochs[sim.epochIndex]
  const progress = getEpochProgress(sim, epochs)

  // Camera: use identical math to updateCamera() in camera.ts so the
  // genesis-to-game transition is pixel-perfect (no rounding drift).
  // Anchor on the player's eventual spawn position (one tile west of
  // Gron, who sits at the exact map center) — see createGameState. This
  // matches what updateCamera will use for state.camera once the game
  // renderer takes over, so the camera does not shift one tile at the
  // handoff.
  const SIDEBAR_WIDTH_PX = 192
  const rightInsetTiles = Math.ceil(SIDEBAR_WIDTH_PX / charWidth)
  const visibleWidth = viewportWidth - rightInsetTiles
  const playerX = Math.floor(sim.width / 2) - 1
  const playerY = Math.floor(sim.height / 2)

  const cameraX =
    sim.width < visibleWidth
      ? -Math.floor((visibleWidth - sim.width) / 2)
      : Math.max(0, Math.min(playerX - Math.floor(visibleWidth / 2), sim.width - visibleWidth))
  const cameraY =
    sim.height < viewportHeight
      ? -Math.floor((viewportHeight - sim.height) / 2)
      : Math.max(0, Math.min(playerY - Math.floor(viewportHeight / 2), sim.height - viewportHeight))

  // Main viewport loop
  ctx.textBaseline = 'top'
  ctx.font = metrics.font

  // Swap in epoch snapshot so renderTile reads the correct per-epoch data
  const useSnapshot = sim.mutationsPrecomputed && sim.epochSnapshots.length > sim.epochIndex
  const liveState = useSnapshot ? captureLiveState(sim) : null

  if (useSnapshot) {
    applySnapshot(sim, sim.epochSnapshots[sim.epochIndex])
  }

  // Cross-fade: blend into next epoch during last 10% of current epoch
  const hasNextEpoch = sim.epochIndex + 1 < epochs.length
  const needsBlend = progress > CROSSFADE_START && hasNextEpoch && useSnapshot
  const blendT = needsBlend ? (progress - CROSSFADE_START) / (1 - CROSSFADE_START) : 0
  const nextEpoch = needsBlend ? epochs[sim.epochIndex + 1] : null
  const nextSnapshot =
    needsBlend && sim.epochSnapshots.length > sim.epochIndex + 1
      ? sim.epochSnapshots[sim.epochIndex + 1]
      : null

  // The visible footprint is a rotated parallelogram. The shared
  // `viewportBounds` helper expands the tile-iteration range to cover
  // every on-screen tile (matching renderer.ts effect passes).
  const { vxStart: tileLoopStartX, vxEnd: tileLoopEndX, vyStart: tileLoopStartY, vyEnd: tileLoopEndY } =
    getVisibleTileBounds(viewportWidth, viewportHeight)

  // Off-canvas cull margin: tiles whose anchor falls outside [-cw, canvasW] ×
  // [-cH, canvasH] cannot contribute visible pixels. Skipping them avoids
  // ~50% of `epoch.renderTile` work, where the expanded iso-square bounding
  // box covers many tiles outside the on-canvas parallelogram. Top margin
  // is expanded by MAX_LIFT_PX so high-tier tiles whose un-lifted py is
  // just above the viewport still get drawn after the lift pulls them in.
  const cullLeft = -charWidth
  const cullRight = canvasWidth + charWidth
  const cullTop = -charHeight - MAX_LIFT_PX
  const cullBottom = canvasHeight + charHeight

  // Per-frame caches. Each is indexed by viewport cell idx so the bg /
  // skirt / wall / glyph passes can share a single renderTile call per
  // tile per epoch. Without this, every tile paid 4+ renderTile calls
  // per frame (bg, skirt, walls, glyph), which dominated the genesis
  // frame budget. The cache also stores the precomputed surface bg so
  // we don't repeat the per-tile darken/water-lookup work.
  const loopWidth = tileLoopEndX - tileLoopStartX
  const loopHeight = tileLoopEndY - tileLoopStartY
  const cellCount = loopWidth * loopHeight
  const idxOf = (vx: number, vy: number): number =>
    (vy - tileLoopStartY) * loopWidth + (vx - tileLoopStartX)

  const currentRendersByIndex = new Array<GenesisTileRender[] | null>(cellCount)
  const currentBgByIndex = new Array<string | null>(cellCount)
  const visibleTileTypeByIndex = new Array<TileType | null>(cellCount)
  {
    let i = 0
    for (let vy = tileLoopStartY; vy < tileLoopEndY; vy++) {
      for (let vx = tileLoopStartX; vx < tileLoopEndX; vx++) {
        const idx = i++
        const { px, py } = viewportToScreen(
          vx,
          vy,
          charWidth,
          charHeight,
          viewportWidth,
          viewportHeight,
        )
        if (px < cullLeft || px > cullRight || py < cullTop || py > cullBottom) {
          currentRendersByIndex[idx] = null
          currentBgByIndex[idx] = null
          visibleTileTypeByIndex[idx] = null
          continue
        }
        const mx = cameraX + vx
        const my = cameraY + vy
        const tile = sim.grid[my]?.[mx]
        if (!tile) {
          currentRendersByIndex[idx] = null
          currentBgByIndex[idx] = null
          visibleTileTypeByIndex[idx] = null
          continue
        }
        // Space tiles still get their glyph rendered (stars / void),
        // but never receive a bg diamond fill / skirt / walls — those
        // passes gate on currentBgByIndex[idx] being non-null.
        const renders = epoch.renderTile(sim, mx, my, progress, time)
        currentRendersByIndex[idx] = renders
        currentBgByIndex[idx] =
          tile.type === TileType.Space
            ? null
            : computeSurfaceBg(sim, epoch.id, mx, my, tile.type, renders[0]?.color)
        visibleTileTypeByIndex[idx] = tile.type
      }
    }
  }

  // Crossfade pre-pass: build a buffer of next-epoch glyph renders for
  // every visible tile in one go, with `nextSnapshot` applied for the
  // entire sweep. Without this, the inner loop would swap snapshots ~17
  // fields × 2 directions per tile (~3.4M field writes per crossfade
  // frame at zoom 0.5). The bg color is intentionally NOT crossfaded —
  // tile-bg snaps at the epoch boundary while only the glyphs blend.
  // Restores the current snapshot at the end so the main draw passes
  // read the right per-epoch data.
  let nextRendersByIndex: (GenesisTileRender | null)[] | null = null
  if (nextEpoch && nextSnapshot) {
    applySnapshot(sim, nextSnapshot)
    nextRendersByIndex = new Array<GenesisTileRender | null>(cellCount)
    let i = 0
    for (let vy = tileLoopStartY; vy < tileLoopEndY; vy++) {
      for (let vx = tileLoopStartX; vx < tileLoopEndX; vx++) {
        const idx = i++
        const tileType = visibleTileTypeByIndex[idx]
        if (tileType === null) {
          nextRendersByIndex[idx] = null
          continue
        }
        const mx = cameraX + vx
        const my = cameraY + vy
        const nextRenders = nextEpoch.renderTile(sim, mx, my, blendT * CROSSFADE_PEEK, time)
        nextRendersByIndex[idx] = nextRenders[0] ?? null
      }
    }
    applySnapshot(sim, sim.epochSnapshots[sim.epochIndex])
  }

  // Per-tile precompute: viewportToScreen + lift, stored in Float32Arrays
  // so the bg / skirt / wall / glyph passes don't repeat the work.
  // currentBgByIndex doubles as the gate — null means skip bg/skirt/wall
  // (space tiles, cosmicFormation, landAccretion, off-canvas tiles).
  const pxByIndex = new Float32Array(cellCount)
  const pyLiftedByIndex = new Float32Array(cellCount)
  const halfW = charWidth / 2
  const halfH = charHeight / 2
  {
    let i = 0
    for (let vy = tileLoopStartY; vy < tileLoopEndY; vy++) {
      for (let vx = tileLoopStartX; vx < tileLoopEndX; vx++) {
        const idx = i++
        if (currentRendersByIndex[idx] === null) continue
        const { px, py } = viewportToScreen(
          vx,
          vy,
          charWidth,
          charHeight,
          viewportWidth,
          viewportHeight,
        )
        pxByIndex[idx] = px
        pyLiftedByIndex[idx] = py + liftAtSim(sim, cameraX + vx, cameraY + vy)
      }
    }
  }

  // Tile-bg fill pre-pass: paint each visible non-space tile's diamond
  // with its (possibly lerped) bg color. Iso painter order
  // (sum-of-coords ascending) so later tiles overlap earlier neighbors
  // cleanly at the seam. Each diamond is expanded by TILE_BG_OVERLAP=2
  // pixels in each direction to mask sub-pixel cracks, matching
  // paintTileBg in tileBgCache.
  const TILE_BG_OVERLAP = 2
  for (let s = tileLoopStartX + tileLoopStartY; s <= tileLoopEndX + tileLoopEndY - 2; s++) {
    const vyMin = Math.max(tileLoopStartY, s - (tileLoopEndX - 1))
    const vyMax = Math.min(tileLoopEndY - 1, s - tileLoopStartX)
    for (let vy = vyMin; vy <= vyMax; vy++) {
      const vx = s - vy
      const idx = idxOf(vx, vy)
      const bg = currentBgByIndex[idx]
      if (!bg) continue
      const px = pxByIndex[idx]
      const topY = pyLiftedByIndex[idx]
      const leftX = px - halfW
      const rightX = leftX + 2 * charWidth
      const bottomY = topY + charHeight
      const cx = leftX + charWidth
      const cy = topY + halfH
      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.moveTo(cx, topY - TILE_BG_OVERLAP)
      ctx.lineTo(rightX + TILE_BG_OVERLAP, cy)
      ctx.lineTo(cx, bottomY + TILE_BG_OVERLAP)
      ctx.lineTo(leftX - TILE_BG_OVERLAP, cy)
      ctx.closePath()
      ctx.fill()
    }
  }

  // Combined skirt + wall pass: same row-major iteration paints both
  // the per-tile cube edge skirt (south + east stroke) and the
  // tier-transition cube walls. Combining halves the per-tile loop +
  // viewportToScreen overhead vs running them as separate passes.
  // Skirt darkens by WALL_RIGHT_SHADE; walls render only when this
  // tile sits higher than its south or east neighbor.
  ctx.lineWidth = 1
  for (let vy = tileLoopStartY; vy < tileLoopEndY; vy++) {
    for (let vx = tileLoopStartX; vx < tileLoopEndX; vx++) {
      const idx = idxOf(vx, vy)
      const bg = currentBgByIndex[idx]
      if (!bg) continue
      const px = pxByIndex[idx]
      const topY = pyLiftedByIndex[idx]
      const leftX = px - halfW
      const rightX = leftX + 2 * charWidth
      const bottomY = topY + charHeight
      const cx = leftX + charWidth
      const cy = topY + halfH
      ctx.strokeStyle = darkenColor(bg, WALL_RIGHT_SHADE)
      ctx.beginPath()
      ctx.moveTo(leftX, cy)
      ctx.lineTo(cx, bottomY)
      ctx.lineTo(rightX, cy)
      ctx.stroke()

      const mx = cameraX + vx
      const my = cameraY + vy
      const tier = tierAtSim(sim, mx, my)
      if (tier <= 0) continue
      const southTier = tierAtSim(sim, mx, my + 1)
      const eastTier = tierAtSim(sim, mx + 1, my)
      const leftDepth = Math.max(0, tier - southTier) * ELEVATION_TIER_LIFT_PX
      const rightDepth = Math.max(0, tier - eastTier) * ELEVATION_TIER_LIFT_PX
      if (leftDepth <= 0 && rightDepth <= 0) continue
      drawCellWalls(
        ctx,
        px,
        topY,
        charWidth,
        charHeight,
        leftDepth,
        rightDepth,
        darkenColor(bg, WALL_LEFT_SHADE),
        darkenColor(bg, WALL_RIGHT_SHADE),
      )
    }
  }

  // Ruin-entrance halo pass — paints the 3x3 dark backdrop behind each
  // RuinEntrance tile so it reads as a doorway-in-shadow. Mirrors the
  // gameplay world-overlay slot: runs AFTER the tile-bg fill + skirt +
  // wall passes, BEFORE the main glyph pass, so the halo paints on top
  // of the surface bg (otherwise the bg fill would erase it). Gated by
  // epoch so it does not conflict with lava/ice/civilization visuals in
  // earlier epochs. Fades in across the fallOfCivilizations -> presentDay
  // crossfade and holds at full opacity through presentDay, so the halo
  // is already present when the game renderer takes over.
  const haloAlpha = computeHaloAlpha(sim.epochIndex, epoch.id, blendT, nextEpoch?.id)
  if (haloAlpha > 0) {
    const prevAlpha = ctx.globalAlpha
    ctx.globalAlpha = haloAlpha
    ctx.fillStyle = RUIN_ENTRANCE_HALO_COLOR
    for (let gy = 0; gy < sim.height; gy++) {
      const row = sim.grid[gy]
      for (let gx = 0; gx < sim.width; gx++) {
        if (row[gx].type !== TileType.RuinEntrance) continue
        const cells = getEntranceHaloCells(sim.grid, sim.width, sim.height, gx, gy)
        for (const cell of cells) {
          const vx = cell.x - cameraX
          const vy = cell.y - cameraY
          if (!isTileInVisibleViewport(vx, vy, viewportWidth, viewportHeight)) continue
          const { px, py } = viewportToScreen(
            vx,
            vy,
            charWidth,
            charHeight,
            viewportWidth,
            viewportHeight,
          )
          const lift = liftAtSim(sim, cell.x, cell.y)
          drawCellBackground(ctx, px, py + lift, charWidth, charHeight)
        }
      }
    }
    ctx.globalAlpha = prevAlpha
  }

  // Main glyph pass: read cached renders + precomputed lifted (px, py)
  // — no fresh renderTile calls, no fresh viewportToScreen / liftAt
  // computation per tile.
  for (let vy = tileLoopStartY; vy < tileLoopEndY; vy++) {
    for (let vx = tileLoopStartX; vx < tileLoopEndX; vx++) {
      const idx = idxOf(vx, vy)
      const renders = currentRendersByIndex[idx]
      if (!renders) continue
      const px = pxByIndex[idx]
      const lifted = pyLiftedByIndex[idx]

      if (nextRendersByIndex) {
        const curR = renders[0]
        const nextR = nextRendersByIndex[idx]
        if (curR && nextR) {
          ctx.fillStyle = lerpColor(curR.color, nextR.color, blendT)
          ctx.fillText(blendT > 0.5 ? nextR.char : curR.char, px + curR.dx, lifted + curR.dy)
        } else if (curR) {
          ctx.fillStyle = curR.color
          ctx.fillText(curR.char, px + curR.dx, lifted + curR.dy)
        }
      } else {
        for (const r of renders) {
          ctx.fillStyle = r.color
          ctx.fillText(r.char, px + r.dx, lifted + r.dy)
        }
      }
    }
  }

  // Restore live state after rendering
  if (liveState) {
    applySnapshot(sim, liveState)
  }

  // Lightning screen flash during FireSeason
  if (epoch.id === GenesisEpochId.FireSeason) {
    for (const bolt of sim.lightningBolts) {
      const boltProgress = (progress - bolt.startTime) / 0.1
      // Flash at the moment of impact (~90% through bolt animation)
      if (boltProgress > 0.85 && boltProgress < 0.95) {
        const flashT = (boltProgress - 0.85) / 0.1
        const flashMs = flashT * LIGHTNING_SCREEN_FLASH_MS
        if (flashMs < LIGHTNING_SCREEN_FLASH_MS) {
          const alpha = LIGHTNING_SCREEN_FLASH_OPACITY * (1 - flashMs / LIGHTNING_SCREEN_FLASH_MS)
          ctx.fillStyle = `rgba(255, 255, 255, ${String(alpha)})`
          ctx.fillRect(0, 0, canvasWidth, canvasHeight)
        }
      }
    }
  }
}
