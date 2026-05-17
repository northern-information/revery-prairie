import {
  EARTH_SCAN_COLOR_HIGH,
  EARTH_SCAN_COLOR_LOW,
  EARTH_SCAN_EXPAND_MS,
  EARTH_SCAN_FADE_MS,
  EARTH_SCAN_HOLD_MS,
  EARTH_SCAN_RADIUS,
  SOIL_HEALTH_DEFAULT,
} from '../../constants'
import { ComponentType } from '../../ecs/types'
import { isInBounds, posKey } from '../../position'
import { drawCellBackground, viewportToScreen } from '../../projection'
import { TileType } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { isEntityInCurrentZone } from '../../zone'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

const lerpColor = (from: string, to: string, t: number): string => {
  const [fr, fg, fb] = hexToRgb(from)
  const [tr, tg, tb] = hexToRgb(to)
  const r = Math.round(fr + (tr - fr) * t)
  const g = Math.round(fg + (tg - fg) * t)
  const b = Math.round(fb + (tb - fb) * t)
  return `rgb(${String(r)},${String(g)},${String(b)})`
}

const soilHealthColor = (health: number): string => {
  const t = Math.max(0, Math.min(health / 100, 1))
  return lerpColor(EARTH_SCAN_COLOR_LOW, EARTH_SCAN_COLOR_HIGH, t)
}

const hasActiveEarthScan = (state: GameState): boolean => {
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!isEntityInCurrentZone(state, eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'reveryCast') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (effect?.reveryId === 'earth') return true
  }
  return false
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, map } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, state.mapWidth, state.mapHeight)
  const savedAlpha = ctx.globalAlpha
  const totalDuration = EARTH_SCAN_EXPAND_MS + EARTH_SCAN_HOLD_MS + EARTH_SCAN_FADE_MS
  const drawBounds = getVisibleTileBounds(viewportWidth, viewportHeight)

  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!isEntityInCurrentZone(state, eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'reveryCast') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!effect?.reveryId || effect.reveryId !== 'earth') continue
    const origin = state.world.getComponent(eid, ComponentType.Position)
    if (!origin) continue

    const elapsed = time - effect.startTime
    const isExpanding = elapsed <= EARTH_SCAN_EXPAND_MS
    const isHolding = !isExpanding && elapsed <= EARTH_SCAN_EXPAND_MS + EARTH_SCAN_HOLD_MS
    const isFading = !isExpanding && !isHolding && elapsed <= totalDuration
    if (!isExpanding && !isHolding && !isFading) continue

    const fadeElapsed = isFading ? elapsed - EARTH_SCAN_EXPAND_MS - EARTH_SCAN_HOLD_MS : 0
    const fadeWaveRadius = isFading ? (fadeElapsed / EARTH_SCAN_FADE_MS) * EARTH_SCAN_RADIUS : 0

    for (let vy = drawBounds.vyStart; vy < drawBounds.vyEnd; vy++) {
      for (let vx = drawBounds.vxStart; vx < drawBounds.vxEnd; vx++) {
        const mx = camera.x + vx
        const my = camera.y + vy
        if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
        const tileType = map[my][mx].type
        if (tileType === TileType.Space || tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall)
          continue

        const dx = mx - origin.x
        const dy = my - origin.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (isExpanding) {
          const expandRadius = (elapsed / EARTH_SCAN_EXPAND_MS) * EARTH_SCAN_RADIUS
          if (dist > expandRadius) continue
        } else if (dist > EARTH_SCAN_RADIUS) {
          continue
        }

        let tileOpacity = 1
        if (isFading) {
          const fadeEdge = fadeWaveRadius
          if (dist < fadeEdge - 3) continue
          if (dist < fadeEdge) tileOpacity = (dist - (fadeEdge - 3)) / 3
        }

        const health = state.soilHealth.get(posKey(mx, my)) ?? SOIL_HEALTH_DEFAULT
        ctx.globalAlpha = tileOpacity
        ctx.fillStyle = soilHealthColor(health)
        const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
        drawCellBackground(
          ctx,
          px,
          py + liftAt(tierGrid, mx, my, state.mapWidth, state.mapHeight),
          charWidth,
          charHeight
        )
      }
    }
  }
  ctx.globalAlpha = savedAlpha
}

export const earthScanPass: RenderPass = {
  id: 'earth-scan',
  slot: 'world-overlay',
  isActive: hasActiveEarthScan,
  draw,
}

registerPass(earthScanPass)
