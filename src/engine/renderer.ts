import {
  BEE_CHAR,
  BEE_COLOR,
  BG_COLOR,
  EXPLOSION_CHARS,
  EXPLOSION_COLORS,
  EXPLOSION_DURATION_MS,
  EXPLOSION_RADIUS,
  FONT,
  METEORITE_CHAR,
  METEORITE_COLOR,
  PLAYER_CHAR,
  PLAYER_COLOR,
  SHOOTING_STAR_HEAD_CHAR,
  SHOOTING_STAR_HEAD_COLOR,
  SHOOTING_STAR_TRAIL_CHARS,
  SHOOTING_STAR_TRAIL_COLORS,
  TILE_CHARS,
  TILE_COLORS,
} from './constants'
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

  // Build maps of shooting star pixels — targeted stars render over land, others only on space
  const shootingStarMap = new Map<string, { char: string; color: string }>()
  const targetedStarMap = new Map<string, { char: string; color: string }>()
  for (const star of state.shootingStars) {
    const map = star.landingTarget ? targetedStarMap : shootingStarMap
    // Head
    map.set(`${String(star.pos.x)},${String(star.pos.y)}`, {
      char: SHOOTING_STAR_HEAD_CHAR,
      color: SHOOTING_STAR_HEAD_COLOR,
    })
    // Trail — step backward along negated velocity
    const trailChar = SHOOTING_STAR_TRAIL_CHARS[`${String(star.dx)},${String(star.dy)}`] ?? '-'
    for (let t = 1; t <= star.length; t++) {
      const tx = star.pos.x - star.dx * t
      const ty = star.pos.y - star.dy * t
      const colorIndex = Math.min(t - 1, SHOOTING_STAR_TRAIL_COLORS.length - 1)
      map.set(`${String(tx)},${String(ty)}`, {
        char: trailChar,
        color: SHOOTING_STAR_TRAIL_COLORS[colorIndex],
      })
    }
  }

  // Build a set of meteorite positions
  const meteoritePositions = new Set<string>()
  for (const m of state.meteorites) {
    meteoritePositions.add(`${String(m.pos.x)},${String(m.pos.y)}`)
  }

  // Build a map of ground omnibox positions for rendering
  const groundOmniboxMap = new Map<string, string>()
  for (const go of state.groundOmniboxes) {
    groundOmniboxMap.set(`${String(go.pos.x)},${String(go.pos.y)}`, go.uid)
  }

  // Build a map of explosion pixels
  const explosionMap = new Map<string, { char: string; color: string }>()
  for (const explosion of state.explosions) {
    const elapsed = time - explosion.startTime
    const progress = Math.min(elapsed / EXPLOSION_DURATION_MS, 1)
    const currentRadius = Math.floor(progress * EXPLOSION_RADIUS)
    const charIndex = Math.min(Math.floor(progress * EXPLOSION_CHARS.length), EXPLOSION_CHARS.length - 1)
    const colorIndex = Math.min(Math.floor(progress * EXPLOSION_COLORS.length), EXPLOSION_COLORS.length - 1)
    const char = EXPLOSION_CHARS[charIndex]
    const color = EXPLOSION_COLORS[colorIndex]

    // Generate particles in a ring at the current radius
    if (currentRadius === 0) {
      explosionMap.set(`${String(explosion.pos.x)},${String(explosion.pos.y)}`, { char, color })
    } else {
      for (let dy = -currentRadius; dy <= currentRadius; dy++) {
        for (let dx = -currentRadius; dx <= currentRadius; dx++) {
          // Only ring positions (not filled circle)
          if (Math.abs(dx) !== currentRadius && Math.abs(dy) !== currentRadius) continue
          const ex = explosion.pos.x + dx
          const ey = explosion.pos.y + dy
          if (ex >= 0 && ex < state.mapWidth && ey >= 0 && ey < state.mapHeight) {
            explosionMap.set(`${String(ex)},${String(ey)}`, { char, color })
          }
        }
      }
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
        const spaceKey = `${String(mx)},${String(my)}`
        const shootingStar = shootingStarMap.get(spaceKey) ?? targetedStarMap.get(spaceKey)
        if (shootingStar) {
          ctx.fillStyle = shootingStar.color
          ctx.fillText(shootingStar.char, px, py)
        } else {
          const h = starHash(mx, my)
          if (h % STAR_DENSITY === 0) {
            const phase = (h >> 8) % STAR_COLORS.length
            const colorIndex = (phase + Math.floor(time * TWINKLE_SPEED)) % STAR_COLORS.length
            ctx.fillStyle = STAR_COLORS[colorIndex]
            ctx.fillText(STAR_CHARS[(h >> 4) % STAR_CHARS.length], px, py)
          }
        }
        continue
      }

      const posKey = `${String(mx)},${String(my)}`
      const isCursor = mx === state.cursorTile?.x && my === state.cursorTile?.y

      // Resolve what to draw at this tile — priority order determines z-index
      let char: string
      let color: string
      let cursorable = true

      const shootingStarOnLand = targetedStarMap.get(posKey)
      const previewTile = previewMap.get(posKey)

      if (mx === player.x && my === player.y) {
        if (previewTile) {
          ctx.fillStyle = previewTile.color
          ctx.fillText(previewTile.char, px, py)
        }
        char = PLAYER_CHAR
        color = PLAYER_COLOR
        cursorable = false
      } else if (shootingStarOnLand) {
        char = shootingStarOnLand.char
        color = shootingStarOnLand.color
        cursorable = false
      } else if (previewTile) {
        char = previewTile.char
        color = previewTile.color
      } else if (beePositions.has(posKey)) {
        char = BEE_CHAR
        color = BEE_COLOR
      } else if (explosionMap.has(posKey)) {
        const ep = explosionMap.get(posKey)
        char = ep?.char ?? '*'
        color = ep?.color ?? '#FFD700'
      } else if (meteoritePositions.has(posKey)) {
        char = METEORITE_CHAR
        color = METEORITE_COLOR
      } else if (groundOmniboxMap.has(posKey)) {
        const omniboxDef = getDefinition('omnibox')
        char = omniboxDef.glyph
        color = omniboxDef.glyphColor
      } else if (groundItemMap.has(posKey)) {
        const defId = groundItemMap.get(posKey)
        if (defId) {
          const def = getDefinition(defId)
          char = def.glyph
          color = def.glyphColor
        } else {
          const tile = map[my][mx]
          char = TILE_CHARS[tile.type]
          color = TILE_COLORS[tile.type]
        }
      } else if (pathPositions.has(posKey)) {
        char = '\u00b7'
        color = '#ff69b4'
      } else {
        const tile = map[my][mx]
        char = TILE_CHARS[tile.type]
        color = TILE_COLORS[tile.type]
      }

      // Draw with cursor inversion if applicable
      if (isCursor && cursorable) {
        ctx.fillStyle = '#ff69b4'
        ctx.fillRect(px, py, charWidth, charHeight)
        ctx.fillStyle = BG_COLOR
      } else {
        ctx.fillStyle = color
      }
      ctx.fillText(char, px, py)
    }
  }
}
