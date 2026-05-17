import { RAIN_AURA_CHARS, RAIN_AURA_COLORS, RAIN_AURA_DENSITY, RAIN_AURA_SPEED } from '../../constants'
import { ComponentType } from '../../ecs/types'
import { tileHash } from '../../position'
import { viewportToScreen } from '../../projection'
import { isTileInVisibleViewport } from '../../viewportBounds'
import { isEntityInCurrentZone } from '../../zone'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, player } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)

  for (const eid of state.world.query(ComponentType.Aura, ComponentType.Position)) {
    if (!isEntityInCurrentZone(state, eid)) continue
    const aura = state.world.getComponent(eid, ComponentType.Aura)
    if (aura?.kind !== 'rain') continue
    const auraPos = state.world.getComponent(eid, ComponentType.Position)
    if (!auraPos) continue
    const cx = auraPos.x
    const cy = auraPos.y
    const rainRadius = aura.radius

    for (let dy = -rainRadius; dy <= rainRadius; dy++) {
      for (let dx = -rainRadius; dx <= rainRadius; dx++) {
        if (dx * dx + dy * dy > rainRadius * rainRadius) continue
        const wx = cx + dx
        const wy = cy + dy
        const vx = wx - camera.x
        const vy = wy - camera.y
        if (!isTileInVisibleViewport(vx, vy, viewportWidth, viewportHeight)) continue
        if (wx === cx && wy === cy) continue
        if (wx === player.x && wy === player.y) continue

        const h = tileHash(wx + state.rainSeed, wy)
        if (h % RAIN_AURA_DENSITY !== 0) continue

        const phase = ((h >> 4) + Math.floor(time * RAIN_AURA_SPEED)) % RAIN_AURA_CHARS.length
        const colorPhase = ((h >> 8) + Math.floor(time * RAIN_AURA_SPEED * 0.7)) % RAIN_AURA_COLORS.length

        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
        ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
        ctx.fillText(RAIN_AURA_CHARS[phase], px, py + liftAt(tierGrid, wx, wy, state.mapWidth, state.mapHeight))
      }
    }
  }
}

export const rainAuraOverlayPass: RenderPass = {
  id: 'rain-aura-overlay',
  slot: 'effect',
  isActive: () => true,
  draw,
}

registerPass(rainAuraOverlayPass)
