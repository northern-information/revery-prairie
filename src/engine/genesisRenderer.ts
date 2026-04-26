import {
  BG_COLOR,
  LIGHTNING_SCREEN_FLASH_MS,
  LIGHTNING_SCREEN_FLASH_OPACITY,
  RUIN_ENTRANCE_HALO_COLOR,
} from './constants'
import { getEpochProgress } from './genesis'
import { GenesisEpochId } from './genesisTypes'
import { getEntranceHaloCells } from './ruins'
import { TileType } from './types'

import type { EpochSnapshot, GenesisEpoch, GenesisSimState } from './genesisTypes'
import type { CharMetrics } from './types'

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
  const SIDEBAR_WIDTH_PX = 192
  const rightInsetTiles = Math.ceil(SIDEBAR_WIDTH_PX / charWidth)
  const visibleWidth = viewportWidth - rightInsetTiles
  const playerX = Math.floor(sim.width / 2)
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

  // Ruin-entrance halo pre-pass — paints the 3x3 dark backdrop behind each
  // RuinEntrance tile so it reads as a doorway-in-shadow, matching the game
  // renderer (renderer.ts ruin-entrance halo pass). Gated by epoch so it
  // does not conflict with lava/ice/civilization visuals in earlier epochs.
  // Fades in across the fallOfCivilizations -> presentDay crossfade and
  // holds at full opacity through presentDay, so the halo is already present
  // when the game renderer takes over.
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
          if (vx < 0 || vx >= viewportWidth || vy < 0 || vy >= viewportHeight) continue
          ctx.fillRect(vx * charWidth, vy * charHeight, charWidth, charHeight)
        }
      }
    }
    ctx.globalAlpha = prevAlpha
  }

  for (let vy = 0; vy < viewportHeight; vy++) {
    for (let vx = 0; vx < viewportWidth; vx++) {
      const mx = cameraX + vx
      const my = cameraY + vy
      const px = vx * charWidth
      const py = vy * charHeight

      const renders = epoch.renderTile(sim, mx, my, progress, time)

      if (nextEpoch && nextSnapshot) {
        // Swap to next epoch's snapshot
        applySnapshot(sim, nextSnapshot)

        // Peek into the start of the next epoch — blendT * CROSSFADE_PEEK
        // keeps the next epoch at low progress so the cross-fade end matches
        // the new epoch's actual start (progress≈0), preventing a visual snap.
        const nextRenders = nextEpoch.renderTile(sim, mx, my, blendT * CROSSFADE_PEEK, time)

        // Restore current epoch's snapshot
        applySnapshot(sim, sim.epochSnapshots[sim.epochIndex])

        // Blend: interpolate color, snap character at midpoint
        const curR = renders[0]
        const nextR = nextRenders[0]
        if (curR && nextR) {
          ctx.fillStyle = lerpColor(curR.color, nextR.color, blendT)
          ctx.fillText(blendT > 0.5 ? nextR.char : curR.char, px + curR.dx, py + curR.dy)
        } else if (curR) {
          ctx.fillStyle = curR.color
          ctx.fillText(curR.char, px + curR.dx, py + curR.dy)
        }
      } else {
        for (const r of renders) {
          ctx.fillStyle = r.color
          ctx.fillText(r.char, px + r.dx, py + r.dy)
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
