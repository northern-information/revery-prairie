import { RAIN_AURA_CHARS, RAIN_AURA_COLORS, RAIN_AURA_SPEED } from '../../constants'
import { ComponentType } from '../../ecs/types'
import { tileHash } from '../../position'
import { viewportToScreen } from '../../projection'
import { getReveryDefinition } from '../../reveries'
import { isTileInVisibleViewport } from '../../viewportBounds'
import { isEntityInCurrentZone } from '../../zone'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// Iterates ECS for rain-style revery cast effects and draws animated rain
// chars on each cast tile. Same visual style as Gron's rain aura.

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)

  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!isEntityInCurrentZone(state, eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'reveryCast') continue
    const multiPos = state.world.getComponent(eid, ComponentType.MultiPosition)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!multiPos || !effect?.reveryId) continue
    const revDef = getReveryDefinition(effect.reveryId)
    if (revDef.castStyle !== 'rain') continue

    for (const pos of multiPos.positions) {
      const wx = pos.x
      const wy = pos.y
      const vx = wx - camera.x
      const vy = wy - camera.y
      if (!isTileInVisibleViewport(vx, vy, viewportWidth, viewportHeight)) continue

      const h = tileHash(wx + state.rainSeed, wy)
      const phase = ((h >> 4) + Math.floor(time * RAIN_AURA_SPEED)) % RAIN_AURA_CHARS.length
      const colorPhase = ((h >> 8) + Math.floor(time * RAIN_AURA_SPEED * 0.7)) % RAIN_AURA_COLORS.length

      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
      ctx.fillText(RAIN_AURA_CHARS[phase], px, py + liftAt(tierGrid, wx, wy, state.mapWidth, state.mapHeight))
    }
  }
}

export const reveryRainOverlayPass: RenderPass = {
  id: 'revery-rain-overlay',
  slot: 'effect',
  isActive: () => true,
  draw,
}

registerPass(reveryRainOverlayPass)
