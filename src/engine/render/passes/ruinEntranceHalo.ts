import { RUIN_ENTRANCE_HALO_COLOR } from '../../constants'
import { drawCellBackground, viewportToScreen } from '../../projection'
import { getEntranceHaloCells } from '../../ruins'
import { Zone, type CharMetrics, type GameState } from '../../types'
import { getTierGrid, liftAt } from '../tierGrid'
import { type RenderPass, registerPass } from '../passes'

const isActive = (state: GameState): boolean =>
  state.currentZone === Zone.Overworld && state.ruinInteriors.length > 0

const draw = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  _time: number,
): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  ctx.fillStyle = RUIN_ENTRANCE_HALO_COLOR
  for (const interior of state.ruinInteriors) {
    const cells = getEntranceHaloCells(
      map,
      state.mapWidth,
      state.mapHeight,
      interior.entranceOverworld.x,
      interior.entranceOverworld.y,
    )
    for (const cell of cells) {
      const vx = cell.x - camera.x
      const vy = cell.y - camera.y
      if (vx < 0 || vx >= viewportWidth || vy < 0 || vy >= viewportHeight) continue
      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      drawCellBackground(
        ctx,
        px,
        py + liftAt(tierGrid, cell.x, cell.y, state.mapWidth, state.mapHeight),
        charWidth,
        charHeight,
      )
    }
  }
}

export const ruinEntranceHaloPass: RenderPass = {
  id: 'ruin-entrance-halo',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(ruinEntranceHaloPass)
