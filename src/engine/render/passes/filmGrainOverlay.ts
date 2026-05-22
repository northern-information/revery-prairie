import { seasonalWash } from '../../tileBg'
import { flushDirtyTiles, getOrBuildCache as getOrBuildBgCache } from '../../tileBgCache'
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

/** Cache canvas downsample factor. Grain is high-frequency noise, so a
 *  half-resolution cache bilinearly upscaled at draw-time is visually
 *  indistinguishable in motion while quartering per-frame fillrate and
 *  cache memory. */
const FILM_GRAIN_CACHE_SCALE = 0.5

/** Asset URL — copy the JPG to public/textures/.
 *
 * 512px crop of the original photograph. The full-resolution
 * `000973910004.jpg` (4432×2914, ~3.7 MB) stays in place for the CSS
 * title-card paths (`.film-grain-overlay`, `.film-grain-overlay-strong`)
 * where it tiles at native resolution. At the world-overlay's 0.2 alpha
 * behind the bg-cache mask, the 512 crop is visually indistinguishable. */
const FILM_GRAIN_TEXTURE_URL = '/textures/000973910004-512.jpg'

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
  bgCanvasRef: AnyCanvas
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

const buildCache = (
  state: GameState,
  map: Tile[][],
  charWidth: number,
  charHeight: number,
  image: HTMLImageElement
): FilmGrainCacheEntry => {
  // Use the tile-bg cache as both a geometry source AND a per-pixel
  // alpha mask. This pins the grain to exactly the pixels the bg-cache
  // paints — same lift, same water sink, same iso geometry. No
  // independent diamond math, no alignment drift, no bounding-box
  // bleed on Space tiles.
  flushDirtyTiles(state, map)
  const bgCache = getOrBuildBgCache(state, map, charWidth, charHeight)
  // Cache canvas is FILM_GRAIN_CACHE_SCALE × the bg-cache size. The pattern
  // fill and bg-cache mask both render at full-resolution coords inside a
  // ctx.scale() transform, so the geometry stays correct; only the backing
  // pixel buffer is downsized. draw() compensates by dividing source
  // coordinates by the same scale.
  const width = Math.ceil(bgCache.canvas.width * FILM_GRAIN_CACHE_SCALE)
  const height = Math.ceil(bgCache.canvas.height * FILM_GRAIN_CACHE_SCALE)
  const { canvas, ctx } = createCanvas(width, height)
  const pattern = ctx.createPattern(image, 'repeat')
  if (pattern !== null) {
    ctx.scale(FILM_GRAIN_CACHE_SCALE, FILM_GRAIN_CACHE_SCALE)
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, bgCache.canvas.width, bgCache.canvas.height)
    // Mask: keep grain only where the bg-cache has painted.
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(bgCache.canvas, 0, 0)
    // Pre-multiply FILM_GRAIN_ALPHA into the cache so the per-frame
    // draw doesn't need to mutate globalAlpha (which forces a non-opaque
    // composite path even on fully-transparent pixels). The seasonal
    // wash attenuation stays dynamic — handled in draw().
    ctx.fillStyle = `rgba(0, 0, 0, ${String(FILM_GRAIN_ALPHA)})`
    ctx.fillRect(0, 0, bgCache.canvas.width, bgCache.canvas.height)
    ctx.globalCompositeOperation = 'source-over'
  }
  const entry: FilmGrainCacheEntry = {
    canvas,
    charWidth,
    charHeight,
    worldOriginX: bgCache.worldOriginX,
    worldOriginY: bgCache.worldOriginY,
    bgCanvasRef: bgCache.canvas,
  }
  cacheByMap.set(map, entry)
  return entry
}

const getOrBuildCache = (
  state: GameState,
  map: Tile[][],
  charWidth: number,
  charHeight: number,
  image: HTMLImageElement
): FilmGrainCacheEntry => {
  const existing = cacheByMap.get(map)
  // Invalidate when font scale changes OR when the bg-cache canvas
  // reference changes (the bg-cache invalidates via cacheContract on
  // elevation / map mutations; a fresh canvas means our masked grain
  // is stale).
  const bgCache = getOrBuildBgCache(state, map, charWidth, charHeight)
  if (
    existing?.charWidth === charWidth &&
    existing.charHeight === charHeight &&
    existing.bgCanvasRef === bgCache.canvas
  ) {
    return existing
  }
  return buildCache(state, map, charWidth, charHeight, image)
}

// ─── pass ─────────────────────────────────────────────────────────────────────

const isActive = (_state: GameState): boolean => grainReady && grainImage !== null

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  if (grainImage === null || !grainReady) return
  const { camera, viewportWidth, viewportHeight, map, mapWidth, mapHeight } = state
  if (mapWidth <= 0 || mapHeight <= 0) return
  const { charWidth, charHeight } = metrics

  const cache = getOrBuildCache(state, map, charWidth, charHeight, grainImage)

  const halfH = charHeight / 2
  const halfW = charWidth / 2
  const originX = (viewportHeight * charWidth) / 2 - halfW
  const originY = ((viewportHeight - viewportWidth) / 4) * charHeight
  const dx = (camera.y - camera.x) * charWidth + originX - cache.worldOriginX
  const dy = -(camera.x + camera.y) * halfH + originY - cache.worldOriginY

  // Source-clip to the visible viewport. Without this, drawImage composites
  // the entire world-sized grain canvas every frame (~1200x2400px on a
  // 147x147 map) even when most of it is off-screen — a measurable
  // per-frame cost. The math mirrors prairieHalo.ts: a source pixel at
  // (sx, sy) lands at (sx + dx, sy + dy) on the main canvas, so we
  // intersect the cache's pixel rect with the on-screen rect.
  //
  // The cache is rendered at FILM_GRAIN_CACHE_SCALE of full resolution, so
  // we work out the rect in full-res screen-space first, then divide the
  // source coordinates by the scale when sampling. The destination stays
  // at full screen resolution — drawImage bilinearly upscales for free.
  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  const fullSx = Math.max(0, Math.floor(-dx))
  const fullSy = Math.max(0, Math.floor(-dy))
  const fullSxEnd = Math.min(cache.canvas.width / FILM_GRAIN_CACHE_SCALE, Math.ceil(canvasW - dx))
  const fullSyEnd = Math.min(cache.canvas.height / FILM_GRAIN_CACHE_SCALE, Math.ceil(canvasH - dy))
  if (fullSx >= fullSxEnd || fullSy >= fullSyEnd) return
  const fullSw = fullSxEnd - fullSx
  const fullSh = fullSyEnd - fullSy
  const sx = fullSx * FILM_GRAIN_CACHE_SCALE
  const sy = fullSy * FILM_GRAIN_CACHE_SCALE
  const sw = fullSw * FILM_GRAIN_CACHE_SCALE
  const sh = fullSh * FILM_GRAIN_CACHE_SCALE

  // FILM_GRAIN_ALPHA is pre-multiplied into the cache (see buildCache).
  // Per-frame globalAlpha mutation is only needed when the seasonal wash
  // attenuates the grain — mostly winter. Skipping the mutation entirely
  // when intensity is 0 lets the composite stay on the fast path.
  const seasonalPhase = state.seasonalPhase
  const washIntensity = typeof seasonalPhase === 'number' ? seasonalWash(seasonalPhase).intensity : 0
  if (washIntensity > 0) {
    const savedAlpha = ctx.globalAlpha
    ctx.globalAlpha = savedAlpha * (1 - washIntensity)
    ctx.drawImage(cache.canvas, sx, sy, sw, sh, fullSx + dx, fullSy + dy, fullSw, fullSh)
    ctx.globalAlpha = savedAlpha
    return
  }
  ctx.drawImage(cache.canvas, sx, sy, sw, sh, fullSx + dx, fullSy + dy, fullSw, fullSh)
}

export const filmGrainOverlayPass: RenderPass = {
  id: 'film-grain-overlay',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(filmGrainOverlayPass)

// ─── public accessors for sibling passes (zone-transition overlay) ──────────

/** Returns the singleton grain image if loaded, else null. */
export const getGrainImage = (): HTMLImageElement | null => (grainReady ? grainImage : null)

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
    state: GameState,
    map: Tile[][],
    charWidth: number,
    charHeight: number,
    image: HTMLImageElement
  ): FilmGrainCacheEntry => getOrBuildCache(state, map, charWidth, charHeight, image),
}
