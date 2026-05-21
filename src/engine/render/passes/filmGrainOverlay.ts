import { seasonalWash } from '../../tileBg'
import { TileType } from '../../types'
import { registerPass } from '../passes'

import type { CharMetrics, GameState, Tile } from '../../types'
import type { RenderPass } from '../passes'

// World-space film grain overlay. Baked once per map into an offscreen
// canvas sized to the same iso bounding box used by tileBgCache, so the
// per-frame work is one drawImage at the same (dx, dy) camera translation.
//
// The grain stays fixed to the land: as the camera pans, the grain pans
// with it (printed-onto-the-prairie semantics, not lens-filter semantics).
//
// Seasonal palette wash interaction: the wash is a per-tile color blend
// inside the central tile-glyph loop and cannot reach a raster overlay,
// so this pass approximates "grain sits under the wash" by attenuating
// its own globalAlpha with (1 - washIntensity). At spring equinox
// (intensity 0.0) grain renders at full FILM_GRAIN_ALPHA; at winter
// solstice (intensity 0.4) it renders at 0.6× FILM_GRAIN_ALPHA.

// ─── tunables ─────────────────────────────────────────────────────────────────

/** Base alpha when no seasonal wash is active. Tune by eye. */
const FILM_GRAIN_ALPHA = 0.2

/** Padding around the iso bounding box (matches tileBgCache convention). */
const FILM_GRAIN_OVERLAP = 2

/** Asset URL — copy the JPG to public/textures/. */
const FILM_GRAIN_TEXTURE_URL = '/textures/000973910004.jpg'

// ─── singleton image loader ───────────────────────────────────────────────────

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type AnyCtx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

let grainImage: HTMLImageElement | null = null
let grainReady = false

const initGrainImage = (): void => {
  if (grainImage !== null) return
  if (typeof Image === 'undefined') return
  const img = new Image()
  img.addEventListener('load', () => {
    grainReady = true
  })
  img.addEventListener('error', () => {
    console.warn(`[filmGrainOverlay] failed to load ${FILM_GRAIN_TEXTURE_URL}`)
  })
  img.src = FILM_GRAIN_TEXTURE_URL
  grainImage = img
}

initGrainImage()

// ─── world-space cache ────────────────────────────────────────────────────────

interface FilmGrainCacheEntry {
  canvas: AnyCanvas
  charWidth: number
  charHeight: number
  worldOriginX: number
  worldOriginY: number
}

const cacheByMap = new WeakMap<Tile[][], FilmGrainCacheEntry>()

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

// Mirrors tileBgCache.computeWorldDimensions exactly so the same (dx, dy)
// translation maps cache pixels to viewport pixels.
const computeWorldDimensions = (
  mapWidth: number,
  mapHeight: number,
  charWidth: number,
  charHeight: number
): { width: number; height: number; worldOriginX: number; worldOriginY: number } => {
  const halfW = charWidth / 2
  const halfH = charHeight / 2
  const worldOriginX = (mapHeight - 1) * charWidth + halfW + FILM_GRAIN_OVERLAP
  const worldOriginY = FILM_GRAIN_OVERLAP
  const width = (mapWidth - 1) * charWidth + worldOriginX + halfW + charWidth + FILM_GRAIN_OVERLAP
  const height = (mapWidth + mapHeight - 2) * halfH + worldOriginY + charHeight + FILM_GRAIN_OVERLAP
  return { width: Math.ceil(width), height: Math.ceil(height), worldOriginX, worldOriginY }
}

const buildCache = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  charWidth: number,
  charHeight: number,
  image: HTMLImageElement
): FilmGrainCacheEntry => {
  const { width, height, worldOriginX, worldOriginY } = computeWorldDimensions(
    mapWidth,
    mapHeight,
    charWidth,
    charHeight
  )
  const { canvas, ctx } = createCanvas(width, height)
  const pattern = ctx.createPattern(image, 'repeat')
  if (pattern !== null) {
    // Paint grain only on non-Space tile diamonds. In zones whose iso
    // bounding box extends beyond their playable footprint (caves, ruins,
    // structures), a uniform fill would outline the bounding box against
    // pure-canvas dark. Diamonds use the same path math as tileBgCache,
    // minus the lift adjustments — lift offsets are below perceptual
    // threshold on a noise texture, and skipping them keeps the cache
    // keyed by map reference alone (not state).
    ctx.fillStyle = pattern
    const halfW = charWidth / 2
    const halfH = charHeight / 2
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = map[y][x]
        if (tile.type === TileType.Space) continue
        const px = (x - y) * charWidth + worldOriginX + halfW
        const py = (x + y) * halfH + worldOriginY
        const leftX = px - halfW
        const rightX = leftX + 2 * charWidth
        const topY = py
        const bottomY = topY + charHeight
        const cx = leftX + charWidth
        const cy = topY + halfH
        ctx.beginPath()
        ctx.moveTo(cx, topY - FILM_GRAIN_OVERLAP)
        ctx.lineTo(rightX + FILM_GRAIN_OVERLAP, cy)
        ctx.lineTo(cx, bottomY + FILM_GRAIN_OVERLAP)
        ctx.lineTo(leftX - FILM_GRAIN_OVERLAP, cy)
        ctx.closePath()
        ctx.fill()
      }
    }
  }
  const entry: FilmGrainCacheEntry = { canvas, charWidth, charHeight, worldOriginX, worldOriginY }
  cacheByMap.set(map, entry)
  return entry
}

const getOrBuildCache = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  charWidth: number,
  charHeight: number,
  image: HTMLImageElement
): FilmGrainCacheEntry => {
  const existing = cacheByMap.get(map)
  if (existing?.charWidth === charWidth && existing.charHeight === charHeight) {
    return existing
  }
  return buildCache(map, mapWidth, mapHeight, charWidth, charHeight, image)
}

// ─── pass ─────────────────────────────────────────────────────────────────────

const isActive = (_state: GameState): boolean => grainReady && grainImage !== null

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  if (grainImage === null || !grainReady) return
  const { camera, viewportWidth, viewportHeight, map, mapWidth, mapHeight } = state
  if (mapWidth <= 0 || mapHeight <= 0) return
  const { charWidth, charHeight } = metrics

  const cache = getOrBuildCache(map, mapWidth, mapHeight, charWidth, charHeight, grainImage)

  const halfH = charHeight / 2
  const halfW = charWidth / 2
  const originX = (viewportHeight * charWidth) / 2 - halfW
  const originY = ((viewportHeight - viewportWidth) / 4) * charHeight
  const dx = (camera.y - camera.x) * charWidth + originX - cache.worldOriginX
  const dy = -(camera.x + camera.y) * halfH + originY - cache.worldOriginY

  const seasonalPhase = state.seasonalPhase
  const washIntensity = typeof seasonalPhase === 'number' ? seasonalWash(seasonalPhase).intensity : 0
  const alpha = FILM_GRAIN_ALPHA * (1 - washIntensity)

  // 'multiply' so grain can only darken the destination, never brighten
  // it. With plain alpha-blend the JPG's bright speckles overlapped
  // visually with white tile-glyph features (trail, fresh footsteps,
  // edge highlights), camouflaging them. Multiply preserves the
  // darkening-dust intent without adding bright pixels.
  const savedAlpha = ctx.globalAlpha
  const savedOp = ctx.globalCompositeOperation
  ctx.globalAlpha = savedAlpha * alpha
  ctx.globalCompositeOperation = 'multiply'
  ctx.drawImage(cache.canvas, dx, dy)
  ctx.globalCompositeOperation = savedOp
  ctx.globalAlpha = savedAlpha
}

export const filmGrainOverlayPass: RenderPass = {
  id: 'film-grain-overlay',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(filmGrainOverlayPass)

// ─── test hooks ───────────────────────────────────────────────────────────────

// Exported solely so tests can drive the image-load state machine and inspect
// cache state without depending on actual image-loading side effects.
export const __testing = {
  getGrainImage: (): HTMLImageElement | null => grainImage,
  isGrainReady: (): boolean => grainReady,
  setGrainImage: (img: HTMLImageElement | null): void => {
    grainImage = img
  },
  setGrainReady: (ready: boolean): void => {
    grainReady = ready
  },
  getCacheEntry: (map: Tile[][]): FilmGrainCacheEntry | undefined => cacheByMap.get(map),
  getOrBuildCache: (
    map: Tile[][],
    mapWidth: number,
    mapHeight: number,
    charWidth: number,
    charHeight: number,
    image: HTMLImageElement
  ): FilmGrainCacheEntry => getOrBuildCache(map, mapWidth, mapHeight, charWidth, charHeight, image),
  buildCacheNow: (
    map: Tile[][],
    mapWidth: number,
    mapHeight: number,
    charWidth: number,
    charHeight: number,
    image: HTMLImageElement
  ): FilmGrainCacheEntry => buildCache(map, mapWidth, mapHeight, charWidth, charHeight, image),
}
