import { isInBounds, posKey } from './position'
import {
  ELEVATION_TIER_COUNT,
  ELEVATION_TIER_LIFT_PX,
  getCraterBgColor,
  getElevationTier,
  getPondBgColor,
  getRiverBgColor,
  getStructurePlatformLift,
  getTierLift,
  getTileBgColor,
  RUIN_ENTRANCE_LIFT_PX,
  WATER_SINK_PX,
} from './tileBg'
import { TileType, Zone } from './types'

import type { GameState, Tile } from './types'

// Water tracked in state.rivers / state.ponds (overworld only) overrides
// the underlying tile.type's bg palette. Without this, water glyphs sit
// over brown dirt diamonds and the seam between the glyph and the bg
// shows brown speckles. Caves and ruins have no water sets to consult.
const getEffectiveBgColor = (state: GameState, tileType: TileType, x: number, y: number): string => {
  if (state.currentZone === Zone.Overworld) {
    const key = posKey(x, y)
    if (state.rivers.has(key)) return getRiverBgColor(x, y)
    if (state.ponds.has(key)) return getPondBgColor(x, y)
    if (tileType === TileType.Dirt && state.craters.has(key)) return getCraterBgColor(x, y)
  }
  return getTileBgColor(tileType, x, y)
}

// World-space tile-bg cache. The full iso bounding box of the map is
// painted once into an offscreen canvas; per-frame the renderer blits
// the cache with a translation derived from the current camera. Per-tile
// dirty marks repaint individual diamonds without rebuilding the whole
// map. The cache is keyed by the map ref (Tile[][]), so overworld, cave,
// and ruin interiors each get their own entry transparently.

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

export interface CacheEntry {
  canvas: AnyCanvas
  ctx: AnyCtx
  dirty: Set<string>
  built: boolean
  charWidth: number
  charHeight: number
  mapWidth: number
  mapHeight: number
  worldOriginX: number
  worldOriginY: number
}

const cacheByMap = new WeakMap<Tile[][], CacheEntry>()

// Vertical headroom for negative lift (high tiers lift up by negative
// pixels). Plus a small buffer for the diamond-overlap expansion used
// when painting tiles.
const TILE_BG_OVERLAP = 2
const LIFT_HEADROOM = (ELEVATION_TIER_COUNT - 1) * ELEVATION_TIER_LIFT_PX + RUIN_ENTRANCE_LIFT_PX + TILE_BG_OVERLAP

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

const computeWorldDimensions = (
  mapWidth: number,
  mapHeight: number,
  charWidth: number,
  charHeight: number
): { width: number; height: number; worldOriginX: number; worldOriginY: number } => {
  const halfW = charWidth / 2
  const halfH = charHeight / 2
  // px = (mx - my)*charWidth + worldOriginX. Range of (mx-my) is
  // [-(mapHeight-1), (mapWidth-1)]. Pick worldOriginX so leftmost diamond
  // edge sits at x=halfW (one half-tile pad on the left for the diamond
  // expansion overlap).
  const worldOriginX = (mapHeight - 1) * charWidth + halfW + TILE_BG_OVERLAP
  // py = (mx + my)*halfH + worldOriginY + lift. Range of (mx+my) is
  // [0, mapWidth+mapHeight-2]. Min lift is -LIFT_HEADROOM. We want min
  // diamond-top y >= 0 → worldOriginY >= LIFT_HEADROOM.
  const worldOriginY = LIFT_HEADROOM
  const width = (mapWidth - 1) * charWidth + worldOriginX + halfW + charWidth + TILE_BG_OVERLAP
  const height = (mapWidth + mapHeight - 2) * halfH + worldOriginY + charHeight + TILE_BG_OVERLAP
  return { width: Math.ceil(width), height: Math.ceil(height), worldOriginX, worldOriginY }
}

const tierAtFromState = (state: GameState, x: number, y: number): number => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return 0
  return getElevationTier(state.elevation.get(posKey(x, y)))
}

const liftAtFromState = (state: GameState, x: number, y: number): number => getTierLift(tierAtFromState(state, x, y))

const platformLiftAtFromState = (state: GameState, map: Tile[][], x: number, y: number): number => {
  if (state.currentZone !== Zone.Overworld) return 0
  const tile = map[y]?.[x]
  if (!tile) return 0
  return getStructurePlatformLift(tile.type)
}

// Positive pixel offset that pushes water tiles below the surrounding
// dirt. Caves and ruin interiors have no water sets, so this returns 0
// for any zone other than overworld.
const waterSinkAtFromState = (state: GameState, x: number, y: number): number => {
  if (state.currentZone !== Zone.Overworld) return 0
  const key = posKey(x, y)
  if (state.rivers.has(key) || state.ponds.has(key)) return WATER_SINK_PX
  return 0
}

const tileWorldPos = (
  entry: CacheEntry,
  x: number,
  y: number,
  state: GameState,
  map: Tile[][]
): { px: number; py: number } => {
  const halfW = entry.charWidth / 2
  const halfH = entry.charHeight / 2
  const px = (x - y) * entry.charWidth + entry.worldOriginX + halfW
  const py =
    (x + y) * halfH +
    entry.worldOriginY +
    liftAtFromState(state, x, y) +
    platformLiftAtFromState(state, map, x, y) +
    waterSinkAtFromState(state, x, y)
  return { px, py }
}

const paintTileBg = (entry: CacheEntry, state: GameState, map: Tile[][], x: number, y: number): void => {
  const { ctx, charWidth, charHeight } = entry
  const halfW = charWidth / 2
  const halfH = charHeight / 2
  const tile = map[y][x]
  if (tile.type === TileType.Space) return
  const caveMaskActive = state.currentZone === Zone.Cave && !state.caveRevealed
  const effectiveType = caveMaskActive && state.caveHiddenPositions.has(posKey(x, y)) ? TileType.CaveWall : tile.type
  const { px, py } = tileWorldPos(entry, x, y, state, map)
  const leftX = px - halfW
  const rightX = leftX + 2 * charWidth
  const topY = py
  const bottomY = topY + charHeight
  const cx = leftX + charWidth
  const cy = topY + halfH
  ctx.fillStyle = getEffectiveBgColor(state, effectiveType, x, y)
  ctx.beginPath()
  ctx.moveTo(cx, topY - TILE_BG_OVERLAP)
  ctx.lineTo(rightX + TILE_BG_OVERLAP, cy)
  ctx.lineTo(cx, bottomY + TILE_BG_OVERLAP)
  ctx.lineTo(leftX - TILE_BG_OVERLAP, cy)
  ctx.closePath()
  ctx.fill()
}

const fullBuild = (entry: CacheEntry, state: GameState, map: Tile[][]): void => {
  // Single-pass paint in iso painter order so neighbor overlaps land
  // cleanly. Per-tile cube outlines are not drawn — visual definition
  // comes from the prairie halo glow and the per-frame cube cliffs at
  // tier transitions and space borders (see renderer.ts).
  const w = entry.mapWidth
  const h = entry.mapHeight
  for (let s = 0; s < w + h - 1; s++) {
    const yMin = Math.max(0, s - (w - 1))
    const yMax = Math.min(h - 1, s)
    for (let y = yMin; y <= yMax; y++) {
      paintTileBg(entry, state, map, s - y, y)
    }
  }
  entry.built = true
}

// Clears the bbox of a single tile (with margin for the 2px overlap
// fills and edge-stroke widths that intrude into the bbox).
const clearTileBbox = (entry: CacheEntry, state: GameState, map: Tile[][], x: number, y: number): void => {
  const { ctx, charWidth, charHeight } = entry
  const halfW = charWidth / 2
  const { px, py } = tileWorldPos(entry, x, y, state, map)
  const leftX = px - halfW
  const topY = py
  const margin = TILE_BG_OVERLAP + 1
  ctx.clearRect(leftX - margin, topY - margin, 2 * charWidth + 2 * margin, charHeight + 2 * margin)
}

export const getOrBuildCache = (state: GameState, map: Tile[][], charWidth: number, charHeight: number): CacheEntry => {
  let entry = cacheByMap.get(map)
  // If metrics changed (font scale toggle), rebuild from scratch.
  if (entry && (entry.charWidth !== charWidth || entry.charHeight !== charHeight)) {
    cacheByMap.delete(map)
    entry = undefined
  }
  if (!entry) {
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
      dirty: new Set(),
      built: false,
      charWidth,
      charHeight,
      mapWidth,
      mapHeight,
      worldOriginX,
      worldOriginY,
    }
    cacheByMap.set(map, entry)
  }
  if (!entry.built) {
    fullBuild(entry, state, map)
  }
  return entry
}

export const markTileDirty = (map: Tile[][], x: number, y: number): void => {
  const entry = cacheByMap.get(map)
  if (!entry) return
  entry.dirty.add(`${String(x)},${String(y)}`)
}

export const flushDirtyTiles = (state: GameState, map: Tile[][]): void => {
  const entry = cacheByMap.get(map)
  if (!entry || entry.dirty.size === 0) return
  // Build dirty-tile coords + the union of all 8-neighbors. clearRect
  // a tile's bbox also erases the 2px overlap-fill and edge-stroke that
  // its neighbors deposited, so neighbors must be repainted too. When
  // multiple adjacent tiles are dirty in the same frame, doing
  // clear+repaint per tile lets the second tile's clear erase the
  // first tile's repaint output — so all clears must precede all
  // repaints.
  const w = entry.mapWidth
  const h = entry.mapHeight
  const dirtyCoords: { x: number; y: number }[] = []
  const repaintSet = new Set<string>()
  const addRepaint = (x: number, y: number): void => {
    if (x < 0 || x >= w || y < 0 || y >= h) return
    repaintSet.add(`${String(x)},${String(y)}`)
  }
  for (const key of entry.dirty) {
    const sep = key.indexOf(',')
    if (sep < 0) continue
    const x = Number(key.slice(0, sep))
    const y = Number(key.slice(sep + 1))
    if (!isInBounds(x, y, w, h)) continue
    dirtyCoords.push({ x, y })
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        addRepaint(x + dx, y + dy)
      }
    }
  }
  for (const { x, y } of dirtyCoords) {
    clearTileBbox(entry, state, map, x, y)
  }
  const repaintCoords: { x: number; y: number; sum: number }[] = []
  for (const key of repaintSet) {
    const sep = key.indexOf(',')
    if (sep < 0) continue
    const x = Number(key.slice(0, sep))
    const y = Number(key.slice(sep + 1))
    repaintCoords.push({ x, y, sum: x + y })
  }
  // Iso painter order for bg fills so the 2px overlap from later tiles
  // cleanly overwrites earlier neighbors at the seam.
  repaintCoords.sort((a, b) => a.sum - b.sum)
  for (const { x, y } of repaintCoords) {
    paintTileBg(entry, state, map, x, y)
  }
  entry.dirty.clear()
}

export const invalidateMapCache = (map: Tile[][]): void => {
  cacheByMap.delete(map)
}

export const getCacheWorldOrigin = (entry: CacheEntry): { worldOriginX: number; worldOriginY: number } => ({
  worldOriginX: entry.worldOriginX,
  worldOriginY: entry.worldOriginY,
})
