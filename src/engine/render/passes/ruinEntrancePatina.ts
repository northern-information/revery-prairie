import { viewportToScreen } from '../../projection'
import { getEntranceHaloCells, getEntrancePatinaLayers } from '../../ruins'
import { Zone } from '../../types'
import { isTileInVisibleViewport } from '../../viewportBounds'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// Sparse verdigris glyphs layered over the 8 perimeter cells of every ruin
// entrance halo footprint. Center entrance tile is skipped — its glyph
// ("O" + "·") is rendered by the tile-glyph slot. Drawn in the effect slot
// so the patina sits above the underlying terrain glyph but below screen
// overlays. Overworld-only.

const isActive = (state: GameState): boolean => state.currentZone === Zone.Overworld && state.ruinInteriors.length > 0

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  const offsetScale = charWidth * 0.25
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  for (const interior of state.ruinInteriors) {
    const ex = interior.entranceOverworld.x
    const ey = interior.entranceOverworld.y
    const cells = getEntranceHaloCells(map, state.mapWidth, state.mapHeight, ex, ey, state.rivers, state.ponds)
    for (const cell of cells) {
      if (cell.x === ex && cell.y === ey) continue
      const vx = cell.x - camera.x
      const vy = cell.y - camera.y
      if (!isTileInVisibleViewport(vx, vy, viewportWidth, viewportHeight)) continue
      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      const pyLift = py + liftAt(tierGrid, cell.x, cell.y, state.mapWidth, state.mapHeight)
      const layers = getEntrancePatinaLayers(cell.x, cell.y, ex, ey)
      for (const layer of layers) {
        ctx.fillStyle = layer.color
        ctx.fillText(layer.char, px + layer.dx * offsetScale, pyLift + layer.dy * offsetScale)
      }
    }
  }
}

export const ruinEntrancePatinaPass: RenderPass = {
  id: 'ruin-entrance-patina',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(ruinEntrancePatinaPass)
