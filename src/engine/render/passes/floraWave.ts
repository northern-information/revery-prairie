import { ACTION_COLOR, POLLEN_BURST_DURATION_MS } from '../../constants'
import { ComponentType } from '../../ecs/types'
import { viewportToScreen } from '../../projection'
import { TileType, Zone } from '../../types'
import { getVisibleTileBounds } from '../../viewportBounds'
import { isEntityInCurrentZone } from '../../zone'
import { registerPass } from '../passes'
import { getTierGrid, liftAt } from '../tierGrid'

import type { CharMetrics, GameState, WaveEmission } from '../../types'
import type { RenderPass } from '../passes'

// Precis #17 — ceremony wave overlay.
//
// Draws two surfaces:
//  1. A faint hot-pink ring on the leading annulus of each active wave,
//     using organic glyphs (',' '%' '*') keyed by tile position so the
//     ring reads as vine/spiral rather than a clean circle.
//  2. Pollen-burst TimedEffect entities — sparse golden '*' glyphs that
//     fade over POLLEN_BURST_DURATION_MS via the same TimedEffect
//     pipeline existing effects use.
//
// Color carve-out: ACTION_COLOR (#ff69b4) is reserved for user-initiated
// actions. The ceremony cast IS a user action, so this is on-doctrine.

const RING_CHARS = [',', '%', '*'] as const
const RING_OPACITY = 0.55
const POLLEN_BURST_COLOR = '#FFD700'
const POLLEN_BURST_CHAR = '*'

// Deterministic glyph picker. Same shape as the cellNoise used in
// floraWaves.ts but local — we only need the mod result, not a [0, 1]
// normalized value.
const ringGlyphAt = (seedIdentity: string, x: number, y: number): string => {
  if (seedIdentity.length === 0) return RING_CHARS[0]
  const i = (x * 31 + y * 17) % seedIdentity.length
  const code = parseInt(seedIdentity[Math.abs(i)], 16) || 0
  return RING_CHARS[code % RING_CHARS.length]
}

const isActive = (state: GameState): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  if (state.activeWaves.length > 0) return true
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'pollenBurst') return true
  }
  return false
}

const drawWaveRing = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  wave: WaveEmission,
): void => {
  const { camera, viewportWidth, viewportHeight, mapWidth, mapHeight } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, mapWidth, mapHeight)
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)

  const r = wave.currentRadius
  if (r <= 0) return

  const minX = Math.max(0, wave.cx - r)
  const maxX = Math.min(mapWidth - 1, wave.cx + r)
  const minY = Math.max(0, wave.cy - r)
  const maxY = Math.min(mapHeight - 1, wave.cy + r)

  ctx.fillStyle = ACTION_COLOR

  for (let wy = minY; wy <= maxY; wy++) {
    for (let wx = minX; wx <= maxX; wx++) {
      const dx = Math.abs(wx - wave.cx)
      const dy = Math.abs(wy - wave.cy)
      const d = Math.max(dx, dy)
      if (d !== r) continue

      const vx = wx - camera.x
      const vy = wy - camera.y
      if (vx < bounds.vxStart || vx >= bounds.vxEnd) continue
      if (vy < bounds.vyStart || vy >= bounds.vyEnd) continue

      // Skip ring tiles that landed on impassable terrain — the ring
      // shouldn't strobe over water or walls. The wave doesn't paint
      // those either, so the ring's visual reach matches its actual
      // effect.
      const tile = state.map[wy][wx]
      if (
        tile.type === TileType.Space ||
        tile.type === TileType.CaveWall ||
        tile.type === TileType.CaveBreakableWall ||
        tile.type === TileType.RuinWall
      ) {
        continue
      }

      const glyph = ringGlyphAt(wave.seedIdentity, wx, wy)
      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
      ctx.fillText(glyph, px, py + liftAt(tierGrid, wx, wy, mapWidth, mapHeight))
    }
  }
}

const drawPollenBursts = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  metrics: CharMetrics,
  time: number,
): void => {
  const { camera, viewportWidth, viewportHeight, mapWidth, mapHeight } = state
  const { charWidth, charHeight } = metrics
  const tierGrid = getTierGrid(state.elevation, mapWidth, mapHeight)
  const bounds = getVisibleTileBounds(viewportWidth, viewportHeight)

  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.Position, ComponentType.EntityTag)) {
    if (!isEntityInCurrentZone(state, eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'pollenBurst') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!pos || !effect) continue
    const elapsed = time - effect.startTime
    if (elapsed >= POLLEN_BURST_DURATION_MS) continue

    const vx = pos.x - camera.x
    const vy = pos.y - camera.y
    if (vx < bounds.vxStart || vx >= bounds.vxEnd) continue
    if (vy < bounds.vyStart || vy >= bounds.vyEnd) continue

    const alpha = 1 - elapsed / POLLEN_BURST_DURATION_MS
    ctx.globalAlpha = alpha
    ctx.fillStyle = POLLEN_BURST_COLOR
    const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)
    ctx.fillText(POLLEN_BURST_CHAR, px, py + liftAt(tierGrid, pos.x, pos.y, mapWidth, mapHeight))
  }
  ctx.globalAlpha = 1
}

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  if (state.activeWaves.length > 0) {
    const savedAlpha = ctx.globalAlpha
    ctx.globalAlpha = RING_OPACITY
    for (const wave of state.activeWaves) {
      drawWaveRing(ctx, state, metrics, wave)
    }
    ctx.globalAlpha = savedAlpha
  }
  drawPollenBursts(ctx, state, metrics, time)
}

export const floraWavePass: RenderPass = {
  id: 'flora-wave',
  slot: 'effect',
  isActive,
  draw,
}

registerPass(floraWavePass)
