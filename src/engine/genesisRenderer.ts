import {
  BG_COLOR,
  LIGHTNING_SCREEN_FLASH_MS,
  LIGHTNING_SCREEN_FLASH_OPACITY,
} from './constants'
import { getEpochProgress } from './genesis'
import { GenesisEpochId } from './genesisTypes'

import type { GenesisEpoch, GenesisSimState } from './genesisTypes'
import type { CharMetrics } from './types'

// Cross-fade window: last 10% of each epoch blends into the next
const CROSSFADE_START = 0.9

/** Parse a hex color (#RGB or #RRGGBB) into [r, g, b]. */
const parseHex = (hex: string): [number, number, number] => {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
  }
  const n = parseInt(h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

/** Lerp two hex color strings, returning an rgb() string. */
const lerpHexColor = (from: string, to: string, t: number): string => {
  const [fr, fg, fb] = parseHex(from)
  const [tr, tg, tb] = parseHex(to)
  const r = Math.round(fr + (tr - fr) * t)
  const g = Math.round(fg + (tg - fg) * t)
  const b = Math.round(fb + (tb - fb) * t)
  return `rgb(${String(r)},${String(g)},${String(b)})`
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
  const liveVegetationMap = sim.vegetationMap
  const liveRiverPaths = sim.riverPaths
  const livePonds = sim.ponds
  const liveElevation = sim.elevation

  if (useSnapshot) {
    const snapshot = sim.epochSnapshots[sim.epochIndex]
    sim.vegetationMap = snapshot.vegetationMap
    sim.riverPaths = snapshot.riverPaths
    sim.ponds = snapshot.ponds
    sim.elevation = snapshot.elevation
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

  for (let vy = 0; vy < viewportHeight; vy++) {
    for (let vx = 0; vx < viewportWidth; vx++) {
      const mx = cameraX + vx
      const my = cameraY + vy
      const px = vx * charWidth
      const py = vy * charHeight

      const renders = epoch.renderTile(sim, mx, my, progress, time)

      if (nextEpoch && nextSnapshot) {
        // Swap to next epoch's snapshot
        sim.vegetationMap = nextSnapshot.vegetationMap
        sim.riverPaths = nextSnapshot.riverPaths
        sim.ponds = nextSnapshot.ponds
        sim.elevation = nextSnapshot.elevation

        const nextRenders = nextEpoch.renderTile(sim, mx, my, 0, time)

        // Restore current epoch's snapshot
        const currentSnapshot = sim.epochSnapshots[sim.epochIndex]
        sim.vegetationMap = currentSnapshot.vegetationMap
        sim.riverPaths = currentSnapshot.riverPaths
        sim.ponds = currentSnapshot.ponds
        sim.elevation = currentSnapshot.elevation

        // Blend: interpolate color, snap character at midpoint
        const curR = renders[0]
        const nextR = nextRenders[0]
        if (curR && nextR) {
          ctx.fillStyle = lerpHexColor(curR.color, nextR.color, blendT)
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
  if (useSnapshot) {
    sim.vegetationMap = liveVegetationMap
    sim.riverPaths = liveRiverPaths
    sim.ponds = livePonds
    sim.elevation = liveElevation
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
