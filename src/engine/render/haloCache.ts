import { PRAIRIE_HALO_COLOR, PRAIRIE_HALO_MAX_ALPHA, PRAIRIE_HALO_RADIUS } from '../constants'
import { TileType } from '../types'

import type { Tile } from '../types'

// World-space halo cache. The prairie halo is a soft glow over space
// tiles adjacent to land — its per-tile alpha is
//   PRAIRIE_HALO_MAX_ALPHA * falloff(distance) * pulse(time)
// where falloff is purely a function of (map, x, y) and pulse is a
// global time-driven multiplier shared across every tile in the frame.
// The cache pre-renders the falloff layer at peak intensity (pulse=1)
// into an offscreen canvas; the renderer composites it each frame with
// ctx.globalAlpha = pulse(time) and a single ctx.filter = blur(...).
//
// See harness/specs/renderer.yaml `halo-cache` behavior.

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

export interface HaloCacheEntry {
  canvas: AnyCanvas
  ctx: AnyCtx
  charWidth: number
  charHeight: number
  mapWidth: number
  mapHeight: number
  worldOriginX: number
  worldOriginY: number
}

const cacheByMap = new WeakMap<Tile[][], HaloCacheEntry>()

const HALO_PAINT_OVERLAP = 2

const createCanvas = (width: number, height: number): { canvas: AnyCanvas; ctx: AnyCtx } => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to acquire 2D context on OffscreenCanvas')
    return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2D context on HTMLCanvasElement')
  return { canvas, ctx }
}

// Mirrors tileBgCache's world bounding box math so a single (dx, dy)
// translation maps cache pixels to viewport pixels.
const computeWorldDimensions = (
  mapWidth: number,
  mapHeight: number,
  charWidth: number,
  charHeight: number
): { width: number; height: number; worldOriginX: number; worldOriginY: number } => {
  const halfW = charWidth / 2
  const halfH = charHeight / 2
  const worldOriginX = (mapHeight - 1) * charWidth + halfW + HALO_PAINT_OVERLAP
  const worldOriginY = HALO_PAINT_OVERLAP
  const width = (mapWidth - 1) * charWidth + worldOriginX + halfW + charWidth + HALO_PAINT_OVERLAP
  const height = (mapWidth + mapHeight - 2) * halfH + worldOriginY + charHeight + HALO_PAINT_OVERLAP
  return { width: Math.ceil(width), height: Math.ceil(height), worldOriginX, worldOriginY }
}

// Chebyshev distance from (x, y) to nearest non-Space, in-bounds tile,
// capped at PRAIRIE_HALO_RADIUS. Returns Infinity beyond the cap. The
// caller has already determined (x, y) is space.
const nearestLandDistance = (map: Tile[][], mapWidth: number, mapHeight: number, x: number, y: number): number => {
  for (let r = 1; r <= PRAIRIE_HALO_RADIUS; r++) {
    const x0 = x - r
    const x1 = x + r
    const y0 = y - r
    const y1 = y + r
    for (let ny = y0; ny <= y1; ny++) {
      if (ny < 0 || ny >= mapHeight) continue
      for (let nx = x0; nx <= x1; nx++) {
        if (nx < 0 || nx >= mapWidth) continue
        if (Math.max(Math.abs(nx - x), Math.abs(ny - y)) !== r) continue
        if (map[ny][nx].type !== TileType.Space) return r
      }
    }
  }
  return Infinity
}

// Falloff at peak pulse: 1 at distance 1, 0 at the radius. Pulse is
// applied at composite time, not bake time.
const peakAlpha = (distance: number): number => {
  if (!Number.isFinite(distance)) return 0
  if (distance < 1 || distance > PRAIRIE_HALO_RADIUS) return 0
  const falloff = 1 - (distance - 1) / PRAIRIE_HALO_RADIUS
  return PRAIRIE_HALO_MAX_ALPHA * falloff
}

const paintHaloDiamond = (entry: HaloCacheEntry, x: number, y: number, alpha: number): void => {
  const { ctx, charWidth, charHeight } = entry
  const halfW = charWidth / 2
  const halfH = charHeight / 2
  const px = (x - y) * charWidth + entry.worldOriginX + halfW
  const py = (x + y) * halfH + entry.worldOriginY
  const leftX = px - halfW
  const rightX = leftX + 2 * charWidth
  const topY = py
  const bottomY = topY + charHeight
  const cx = leftX + charWidth
  const cy = topY + halfH
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.moveTo(cx, topY - HALO_PAINT_OVERLAP)
  ctx.lineTo(rightX + HALO_PAINT_OVERLAP, cy)
  ctx.lineTo(cx, bottomY + HALO_PAINT_OVERLAP)
  ctx.lineTo(leftX - HALO_PAINT_OVERLAP, cy)
  ctx.closePath()
  ctx.fill()
}

const fullBuild = (entry: HaloCacheEntry, map: Tile[][]): void => {
  const { ctx, mapWidth, mapHeight } = entry
  ctx.fillStyle = PRAIRIE_HALO_COLOR
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      if (map[y][x].type !== TileType.Space) continue
      const dist = nearestLandDistance(map, mapWidth, mapHeight, x, y)
      const alpha = peakAlpha(dist)
      if (alpha <= 0) continue
      paintHaloDiamond(entry, x, y, alpha)
    }
  }
  ctx.globalAlpha = 1
}

export const getOrBuildHaloCache = (map: Tile[][], charWidth: number, charHeight: number): HaloCacheEntry => {
  let entry = cacheByMap.get(map)
  if (entry && (entry.charWidth !== charWidth || entry.charHeight !== charHeight)) {
    cacheByMap.delete(map)
    entry = undefined
  }
  if (entry) return entry
  const mapHeight = map.length
  const mapWidth = map[0]?.length ?? 0
  const { width, height, worldOriginX, worldOriginY } = computeWorldDimensions(
    mapWidth,
    mapHeight,
    charWidth,
    charHeight
  )
  const { canvas, ctx } = createCanvas(width, height)
  entry = {
    canvas,
    ctx,
    charWidth,
    charHeight,
    mapWidth,
    mapHeight,
    worldOriginX,
    worldOriginY,
  }
  fullBuild(entry, map)
  cacheByMap.set(map, entry)
  return entry
}

export const invalidateHaloCache = (map: Tile[][]): void => {
  cacheByMap.delete(map)
}
