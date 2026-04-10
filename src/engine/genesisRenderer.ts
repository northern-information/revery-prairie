import { BASE_FONT_SIZE, BG_COLOR } from './constants'
import { getEpochProgress, getGenesisCommentary } from './genesis'

import type { GenesisEpoch, GenesisSimState } from './genesisTypes'
import type { CharMetrics } from './types'

// Commentary styling
const COMMENTARY_FONT_SCALE = 1.5
const COMMENTARY_SHOW_MS = 3000
const COMMENTARY_FADE_MS = 300

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

  // Camera: center on the map, lerping toward game camera during Present Day
  const isLastEpoch = sim.epochIndex === epochs.length - 1
  const SIDEBAR_WIDTH_PX = 192
  const rightInsetTiles = Math.ceil(SIDEBAR_WIDTH_PX / charWidth)
  const visibleWidth = viewportWidth - rightInsetTiles

  // Genesis default: center map in full viewport
  const genCamX = Math.floor(sim.width / 2 - viewportWidth / 2)
  const genCamY = Math.floor(sim.height / 2 - viewportHeight / 2)

  // Game camera: center player in visible (non-sidebar) area
  const playerX = Math.floor(sim.width / 2)
  const playerY = Math.floor(sim.height / 2)
  const gameCamX =
    sim.width < visibleWidth
      ? -Math.floor((visibleWidth - sim.width) / 2)
      : Math.max(0, Math.min(playerX - Math.floor(visibleWidth / 2), sim.width - visibleWidth))
  const gameCamY =
    sim.height < viewportHeight
      ? -Math.floor((viewportHeight - sim.height) / 2)
      : Math.max(0, Math.min(playerY - Math.floor(viewportHeight / 2), sim.height - viewportHeight))

  let cameraX: number
  let cameraY: number
  if (isLastEpoch && progress > 0.8) {
    const lerpT = (progress - 0.8) / 0.2
    cameraX = Math.round(genCamX + (gameCamX - genCamX) * lerpT)
    cameraY = Math.round(genCamY + (gameCamY - genCamY) * lerpT)
  } else {
    cameraX = genCamX
    cameraY = genCamY
  }

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

  // Commentary overlay with fade in/out (shown for 3 seconds per epoch)
  const commentary = getGenesisCommentary(sim, epochs)
  if (commentary) {
    const elapsed = sim.epochStartTime > 0 ? time - sim.epochStartTime : 0
    // Fade in for first 300ms, hold, fade out ending at 3000ms
    const fadeOutStart = COMMENTARY_SHOW_MS - COMMENTARY_FADE_MS
    let alpha = 1
    if (elapsed < COMMENTARY_FADE_MS) {
      alpha = elapsed / COMMENTARY_FADE_MS
    } else if (elapsed > fadeOutStart) {
      alpha = Math.max(0, 1 - (elapsed - fadeOutStart) / COMMENTARY_FADE_MS)
    }

    if (alpha > 0.01) {
      const fontSize = Math.round(BASE_FONT_SIZE * COMMENTARY_FONT_SCALE * (metrics.charHeight / (BASE_FONT_SIZE + 2)))
      ctx.font = `${String(fontSize)}px monospace`
      const textMetrics = ctx.measureText(commentary)
      const textWidth = textMetrics.width
      const textHeight = fontSize + 4

      const tx = Math.floor((canvasWidth - textWidth) / 2)
      const ty = Math.floor((canvasHeight - textHeight) / 2)

      // Background bar
      ctx.fillStyle = `rgba(0, 0, 0, ${String(alpha)})`
      ctx.fillRect(tx - 10, ty - 4, textWidth + 20, textHeight + 8)

      // Text
      ctx.fillStyle = `rgba(153, 153, 153, ${String(alpha)})`
      ctx.textBaseline = 'top'
      ctx.fillText(commentary, tx, ty)

      // Restore font
      ctx.font = metrics.font
    }
  }

  // Progress bar — bottom center, above skip hint
  const BAR_WIDTH = 30
  const smoothProgress = (sim.epochIndex + progress) / epochs.length
  const filledCount = Math.round(smoothProgress * BAR_WIDTH)
  const filledChars = '\u2588'.repeat(filledCount)
  const emptyChars = '\u2591'.repeat(BAR_WIDTH - filledCount)
  const counter = `${String(sim.epochIndex + 1)}/${String(epochs.length)}`
  const barText = `[${filledChars}${emptyChars}] ${counter}`

  const barFontSize = Math.round(BASE_FONT_SIZE * 0.85 * (metrics.charHeight / (BASE_FONT_SIZE + 2)))
  ctx.font = `${String(barFontSize)}px monospace`

  // Measure full bar for centering and background
  const barMetrics = ctx.measureText(barText)
  const barTotalWidth = barMetrics.width
  const barHeight = barFontSize + 4
  const barX = Math.floor((canvasWidth - barTotalWidth) / 2)
  const barY = canvasHeight - barFontSize - 10 - barFontSize - 16

  // Semi-transparent background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.fillRect(barX - 8, barY - 4, barTotalWidth + 16, barHeight + 8)

  // Render brackets in dim color
  ctx.textBaseline = 'top'
  const bracketOpen = '['
  const bracketClose = '] '
  const bracketOpenWidth = ctx.measureText(bracketOpen).width
  const filledWidth = ctx.measureText(filledChars).width
  const emptyWidth = ctx.measureText(emptyChars).width
  const bracketCloseWidth = ctx.measureText(bracketClose).width

  let cursorX = barX
  ctx.fillStyle = '#666666'
  ctx.fillText(bracketOpen, cursorX, barY)
  cursorX += bracketOpenWidth

  ctx.fillStyle = '#999999'
  ctx.fillText(filledChars, cursorX, barY)
  cursorX += filledWidth

  ctx.fillStyle = '#333333'
  ctx.fillText(emptyChars, cursorX, barY)
  cursorX += emptyWidth

  ctx.fillStyle = '#666666'
  ctx.fillText(bracketClose, cursorX, barY)
  cursorX += bracketCloseWidth

  ctx.fillStyle = '#666666'
  ctx.fillText(counter, cursorX, barY)

  // Skip hint — bottom right, small
  const skipText = 'press any key to skip'
  const skipFontSize = Math.round(BASE_FONT_SIZE * 0.8 * (metrics.charHeight / (BASE_FONT_SIZE + 2)))
  ctx.font = `${String(skipFontSize)}px monospace`
  ctx.fillStyle = '#555555'
  const skipMetrics = ctx.measureText(skipText)
  ctx.fillText(skipText, canvasWidth - skipMetrics.width - 10, canvasHeight - skipFontSize - 10)

  // Restore font
  ctx.font = metrics.font
}
