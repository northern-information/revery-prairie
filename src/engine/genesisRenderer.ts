import { BASE_FONT_SIZE, BG_COLOR } from './constants'
import { getEpochProgress, getGenesisCommentary } from './genesis'

import type { CharMetrics } from './types'
import type { GenesisEpoch, GenesisSimState } from './genesisTypes'

// Commentary styling
const COMMENTARY_FONT_SCALE = 1.5
const COMMENTARY_COLOR = '#999999'
const COMMENTARY_BG = 'rgba(26, 26, 26, 0.7)'
const COMMENTARY_PADDING_Y = 20

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

  // Camera: center on the map
  const cameraX = Math.floor(sim.width / 2 - viewportWidth / 2)
  const cameraY = Math.floor(sim.height / 2 - viewportHeight / 2)

  // Main viewport loop
  ctx.textBaseline = 'top'
  ctx.font = metrics.font

  for (let vy = 0; vy < viewportHeight; vy++) {
    for (let vx = 0; vx < viewportWidth; vx++) {
      const mx = cameraX + vx
      const my = cameraY + vy
      const px = vx * charWidth
      const py = vy * charHeight

      // Out of bounds — black
      if (mx < 0 || mx >= sim.width || my < 0 || my >= sim.height) {
        continue
      }

      const renders = epoch.renderTile(sim, mx, my, progress, time)

      for (const r of renders) {
        ctx.fillStyle = r.color
        ctx.fillText(r.char, px + r.dx, py + r.dy)
      }
    }
  }

  // Commentary overlay
  const commentary = getGenesisCommentary(sim, epochs)
  if (commentary) {
    const fontSize = Math.round(BASE_FONT_SIZE * COMMENTARY_FONT_SCALE * (metrics.charHeight / (BASE_FONT_SIZE + 2)))
    ctx.font = `${String(fontSize)}px monospace`
    const textMetrics = ctx.measureText(commentary)
    const textWidth = textMetrics.width
    const textHeight = fontSize + 4

    const tx = Math.floor((canvasWidth - textWidth) / 2)
    const ty = canvasHeight - COMMENTARY_PADDING_Y - textHeight

    // Background bar
    ctx.fillStyle = COMMENTARY_BG
    ctx.fillRect(tx - 10, ty - 4, textWidth + 20, textHeight + 8)

    // Text
    ctx.fillStyle = COMMENTARY_COLOR
    ctx.textBaseline = 'top'
    ctx.fillText(commentary, tx, ty)

    // Restore font
    ctx.font = metrics.font
  }

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
