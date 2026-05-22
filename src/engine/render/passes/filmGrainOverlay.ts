import { seasonalWash } from '../../tileBg'
import { registerPass } from '../passes'

import type { CharMetrics, GameState } from '../../types'
import type { RenderPass } from '../passes'

// World-locked film grain overlay. The grain texture (512×512) is baked
// once into an alpha-premultiplied tile canvas, then drawn as a small
// grid of tiles spanning the viewport every frame. The grid is anchored
// to world coordinates via (cameraDx % tileSize), so the grain pans with
// the prairie ("printed-onto-the-world" semantics) rather than the
// screen.
//
// Grain renders across the entire viewport including the Space border.
// At 0.2 alpha over black this is barely visible and reads as
// photographic medium across the whole frame — consistent with the CSS
// .film-grain-overlay treatment on the title card and gel scan modals.
//
// Why drawImage-grid instead of createPattern + fillRect: arbitrary
// pattern transforms force the canvas 2D backend off its fast blit path
// and into a slower pattern-sampling path (~5 ms/frame measured). A
// small grid of axis-aligned drawImage calls of a pre-baked tile keeps
// the fast path and costs ~0.2 ms/frame.
//
// Seasonal palette wash interaction: the wash is a per-tile color blend
// inside the central tile-glyph loop and cannot reach a raster overlay,
// so this pass approximates "grain sits under the wash" by attenuating
// its own globalAlpha with (1 - washIntensity) at draw-time. At spring
// equinox (intensity 0.0) grain renders at full FILM_GRAIN_ALPHA; at
// winter solstice (intensity 0.4) it renders at 0.6× FILM_GRAIN_ALPHA.

// ─── tunables ─────────────────────────────────────────────────────────────────

/** Base alpha when no seasonal wash is active. Tune by eye. */
const FILM_GRAIN_ALPHA = 0.2

/** Asset URL — copy the JPG to public/textures/.
 *
 * 512px crop of the original photograph. The full-resolution
 * `000973910004.jpg` (4432×2914, ~3.7 MB) stays in place for the CSS
 * title-card paths (`.film-grain-overlay`, `.film-grain-overlay-strong`)
 * where it tiles at native resolution. At 0.2 alpha the 512 crop is
 * visually indistinguishable. */
const FILM_GRAIN_TEXTURE_URL = '/textures/000973910004-512.jpg'

/** Side length of the cached tile canvas. Matches the source texture so
 *  no resampling happens during the one-shot bake. */
const TILE_SIZE = 512

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

// ─── tile cache ───────────────────────────────────────────────────────────────

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

let tileCanvas: AnyCanvas | null = null
let tileSourceImage: HTMLImageElement | null = null

const getOrBuildTile = (image: HTMLImageElement): AnyCanvas | null => {
  // Rebuild only when the source image identity changes (effectively
  // never under normal load; the singleton image is loaded once).
  if (tileCanvas !== null && tileSourceImage === image) return tileCanvas
  const { canvas, ctx } = createCanvas(TILE_SIZE, TILE_SIZE)
  ctx.drawImage(image, 0, 0, TILE_SIZE, TILE_SIZE)
  // Pre-multiply FILM_GRAIN_ALPHA into the tile so per-frame blits don't
  // touch globalAlpha for the base alpha (the seasonal wash still does,
  // when active).
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = `rgba(0, 0, 0, ${String(FILM_GRAIN_ALPHA)})`
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE)
  ctx.globalCompositeOperation = 'source-over'
  tileCanvas = canvas
  tileSourceImage = image
  return canvas
}

// ─── pass ─────────────────────────────────────────────────────────────────────

const isActive = (_state: GameState): boolean => grainReady && grainImage !== null

const draw = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, _time: number): void => {
  if (grainImage === null || !grainReady) return
  const { camera, viewportWidth, viewportHeight } = state
  const { charWidth, charHeight } = metrics

  const tile = getOrBuildTile(grainImage)
  if (tile === null) return

  // Iso projection offsets — same math the renderer uses to place world
  // tiles on screen. dx/dy is the world-origin's screen position; we
  // anchor the tile grid to it so grain pans with the prairie.
  const halfH = charHeight / 2
  const halfW = charWidth / 2
  const originX = (viewportHeight * charWidth) / 2 - halfW
  const originY = ((viewportHeight - viewportWidth) / 4) * charHeight
  const dx = (camera.y - camera.x) * charWidth + originX
  const dy = -(camera.x + camera.y) * halfH + originY

  // Snap the grid start to the nearest multiple of TILE_SIZE on each
  // side of the viewport so a single full row/column of tiles always
  // covers the viewport. Modulo on negative numbers needs the +TILE_SIZE
  // adjustment to stay positive.
  const startX = Math.floor(dx) % TILE_SIZE
  const startY = Math.floor(dy) % TILE_SIZE
  const offsetX = startX > 0 ? startX - TILE_SIZE : startX
  const offsetY = startY > 0 ? startY - TILE_SIZE : startY

  const seasonalPhase = state.seasonalPhase
  const washIntensity = typeof seasonalPhase === 'number' ? seasonalWash(seasonalPhase).intensity : 0
  const wash = washIntensity > 0
  const savedAlpha = wash ? ctx.globalAlpha : 0
  if (wash) ctx.globalAlpha = savedAlpha * (1 - washIntensity)

  const canvasW = ctx.canvas.width
  const canvasH = ctx.canvas.height
  for (let y = offsetY; y < canvasH; y += TILE_SIZE) {
    for (let x = offsetX; x < canvasW; x += TILE_SIZE) {
      ctx.drawImage(tile, x, y)
    }
  }

  if (wash) ctx.globalAlpha = savedAlpha
}

export const filmGrainOverlayPass: RenderPass = {
  id: 'film-grain-overlay',
  slot: 'world-overlay',
  isActive,
  draw,
}

registerPass(filmGrainOverlayPass)

// ─── test hooks ───────────────────────────────────────────────────────────────

// Exported solely so tests can drive the image-load state machine without
// depending on actual image-loading side effects.
export const __testing = {
  getGrainImage: (): HTMLImageElement | null => grainImage,
  isGrainReady: (): boolean => grainReady,
  setGrainImage: (img: HTMLImageElement | null): void => {
    grainImage = img
    // Reset the tile cache when the source image swaps (tests).
    tileCanvas = null
    tileSourceImage = null
  },
  setGrainReady: (ready: boolean): void => {
    grainReady = ready
  },
}
