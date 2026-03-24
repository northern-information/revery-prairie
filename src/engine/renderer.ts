import { BEE_CHAR, BEE_COLOR, BG_COLOR, FONT, PLAYER_CHAR, PLAYER_COLOR, TILE_CHARS, TILE_COLORS } from './constants'
import { getDefinition } from './items'
import { TileType } from './types'

import type { GameState } from './types'

// Simple hash for deterministic star placement based on world coordinates
const starHash = (x: number, y: number): number => {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  h = h ^ (h >> 16)
  return h >>> 0
}

const STAR_CHARS = ['.', '+', '*']
const STAR_COLORS = ['#333', '#555', '#777', '#999', '#bbb', '#999', '#777', '#555']
const STAR_DENSITY = 12 // ~1 in 12 tiles gets a star
const TWINKLE_SPEED = 0.0015 // cycles per millisecond

export interface CharMetrics {
  charWidth: number
  charHeight: number
}

export const measureChar = (ctx: CanvasRenderingContext2D): CharMetrics => {
  ctx.font = FONT
  const metrics = ctx.measureText('M')
  const charWidth = metrics.width
  const charHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 2
  return { charWidth, charHeight }
}

export const render = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, map, player, bees } = state
  const { charWidth, charHeight } = metrics

  const pxWidth = viewportWidth * charWidth
  const pxHeight = viewportHeight * charHeight
  ctx.clearRect(0, 0, pxWidth, pxHeight)
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, pxWidth, pxHeight)

  ctx.font = FONT
  ctx.textBaseline = 'top'

  // Build a set of bee positions for fast lookup
  const beePositions = new Set<string>()
  for (const bee of bees) {
    beePositions.add(`${String(bee.pos.x)},${String(bee.pos.y)}`)
  }

  // Build a map of ground item positions for rendering
  const groundItemMap = new Map<string, string>()
  for (const gi of state.groundItems) {
    groundItemMap.set(`${String(gi.pos.x)},${String(gi.pos.y)}`, gi.definitionId)
  }

  // Build a map of preview tile positions for macro recipe previews
  const previewMap = new Map<string, { char: string; color: string }>()
  if (state.previewFn) {
    for (const pt of state.previewFn(state)) {
      previewMap.set(`${String(pt.pos.x)},${String(pt.pos.y)}`, { char: pt.char, color: pt.color })
    }
  }

  // Build a set of path positions for highlight rendering
  const pathPositions = new Set<string>()
  if (state.path) {
    for (const p of state.path) {
      pathPositions.add(`${String(p.x)},${String(p.y)}`)
    }
  }

  for (let vy = 0; vy < viewportHeight; vy++) {
    for (let vx = 0; vx < viewportWidth; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy

      const px = vx * charWidth
      const py = vy * charHeight

      // Out-of-bounds and Space tiles render as twinkling stars
      const isOutOfBounds = mx < 0 || mx >= state.mapWidth || my < 0 || my >= state.mapHeight
      if (isOutOfBounds || map[my][mx].type === TileType.Space) {
        const h = starHash(mx, my)
        if (h % STAR_DENSITY === 0) {
          const phase = (h >> 8) % STAR_COLORS.length
          const colorIndex = (phase + Math.floor(time * TWINKLE_SPEED)) % STAR_COLORS.length
          ctx.fillStyle = STAR_COLORS[colorIndex]
          ctx.fillText(STAR_CHARS[(h >> 4) % STAR_CHARS.length], px, py)
        }
        continue
      }

      const posKey = `${String(mx)},${String(my)}`
      const previewTile = previewMap.get(posKey)

      if (mx === player.x && my === player.y) {
        if (previewTile) {
          ctx.fillStyle = previewTile.color
          ctx.fillText(previewTile.char, px, py)
        }
        ctx.fillStyle = PLAYER_COLOR
        ctx.fillText(PLAYER_CHAR, px, py)
      } else if (previewTile) {
        ctx.fillStyle = previewTile.color
        ctx.fillText(previewTile.char, px, py)
      } else if (beePositions.has(posKey)) {
        ctx.fillStyle = BEE_COLOR
        ctx.fillText(BEE_CHAR, px, py)
      } else if (groundItemMap.has(posKey)) {
        const defId = groundItemMap.get(`${String(mx)},${String(my)}`)
        if (defId) {
          const def = getDefinition(defId)
          ctx.fillStyle = def.iconColor
          ctx.fillText(def.icon, px, py)
        }
      } else if (pathPositions.has(`${String(mx)},${String(my)}`)) {
        ctx.fillStyle = '#666'
        ctx.fillText('\u00b7', px, py)
      } else {
        const tile = map[my][mx]
        ctx.fillStyle = TILE_COLORS[tile.type]
        ctx.fillText(TILE_CHARS[tile.type], px, py)
      }
    }
  }
}
