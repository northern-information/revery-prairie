import { ANGEL_AURA_RADIUS } from '../../constants'
import { ComponentType } from '../../ecs/types'
import { isInBounds } from '../../position'
import { drawCellBackground, viewportToScreen } from '../../projection'
import { TileType } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { isEntityInCurrentZone } from '../../zone'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const collectAngelCenters = (state: GameState): { x: number; y: number }[] => {
  const centers: { x: number; y: number }[] = []
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.Position)) {
    if (!isEntityInCurrentZone(state, eid)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    centers.push({ x: pos.x, y: pos.y })
  }
  return centers
}

// Lightweight check — short-circuits on first match without collecting positions.
// collectAngelCenters (which allocates) only runs once, inside draw().
const isActive = (state: GameState): boolean => {
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.Position)) {
    if (isEntityInCurrentZone(state, eid)) return true
  }
  return false
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  const centers = collectAngelCenters(state)
  if (centers.length === 0) return
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const savedAlpha = ctx.globalAlpha
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)
  for (let vy = bounds.vyStart; vy < bounds.vyEnd; vy++) {
    for (let vx = bounds.vxStart; vx < bounds.vxEnd; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy
      if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
      if (map[my][mx].type === TileType.Space) continue

      for (const ac of centers) {
        const dx = mx - ac.x
        const dy = my - ac.y
        // Distance is measured so the aura reads as a *circle on screen*.
        // Raw tile-space Euclidean distance projects to a 2:1 screen-space
        // ellipse (stretched horizontally), which makes the aura look
        // "off". Convert (dx, dy) into screen-space delta and normalize
        // back into tile-width units.
        const sdx = (dx - dy) * charWidth
        const sdy = (dx + dy) * (charHeight / 2)
        const distInTiles = Math.sqrt(sdx * sdx + sdy * sdy) / charWidth
        if (distInTiles > ANGEL_AURA_RADIUS) continue

        const wave = Math.sin(time * 0.002 + distInTiles * 0.3) * 0.5 + 0.5
        const falloff = 1 - distInTiles / ANGEL_AURA_RADIUS
        const alpha = 0.06 + 0.06 * wave * falloff

        ctx.globalAlpha = alpha
        ctx.fillStyle = '#FFD700'
        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
        drawCellBackground(
          ctx,
          px,
          py + liftAt(tierGrid, mx, my, state.mapWidth, state.mapHeight),
          charWidth,
          charHeight
        )
        break // only one angel aura can contribute per tile
      }
    }
  }
  ctx.globalAlpha = savedAlpha
}

export const angelGoldAuraPass: RenderPass = {
  id: 'angel-gold-aura',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(angelGoldAuraPass)
