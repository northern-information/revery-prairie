import { getCharacterDefinition } from './characters'
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
import { isInBounds, posKey } from './position'
import { TileType } from './types'

import type { GameState } from './types'

// Simple hash for deterministic star placement based on world coordinates
const starHash = (x: number, y: number): number => {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  h = h ^ (h >> 16)
  return h >>> 0
}

// Rain around characters with the `rain` aura
const RAIN_CHARS = ['|', ':', '.', ',']
const RAIN_COLORS = ['#4466aa', '#335588', '#556699', '#445577']
const RAIN_RADIUS = 6
const RAIN_DENSITY = 3 // ~1 in 3 tiles has a visible raindrop
const RAIN_SPEED = 0.008 // cycles per millisecond — fast falling feel

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
    beePositions.add(posKey(bee.pos.x, bee.pos.y))
  }

  // Build a map of ground item positions for rendering
  const groundItemMap = new Map<string, string>()
  for (const gi of state.groundItems) {
    groundItemMap.set(posKey(gi.pos.x, gi.pos.y), gi.definitionId)
  }

  // Build a map of preview tile positions for macro recipe previews
  const previewMap = new Map<string, { char: string; color: string }>()
  if (state.previewFn) {
    for (const pt of state.previewFn(state)) {
      previewMap.set(posKey(pt.pos.x, pt.pos.y), { char: pt.char, color: pt.color })
    }
  }

  // Build a set of path positions for highlight rendering
  const pathPositions = new Set<string>()
  if (state.path) {
    for (const p of state.path) {
      pathPositions.add(posKey(p.x, p.y))
    }
  }

  // Build maps of shooting star pixels — targeted stars render over land, others only on space
  const shootingStarMap = new Map<string, { char: string; color: string }>()
  const targetedStarMap = new Map<string, { char: string; color: string }>()
  for (const star of state.shootingStars) {
    const map = star.landingTarget ? targetedStarMap : shootingStarMap
    // Head
    map.set(posKey(star.pos.x, star.pos.y), {
      char: SHOOTING_STAR_HEAD_CHAR,
      color: SHOOTING_STAR_HEAD_COLOR,
    })
    // Trail — step backward along negated velocity
    const trailChar = SHOOTING_STAR_TRAIL_CHARS[posKey(star.dx, star.dy)] ?? '-'
    for (let t = 1; t <= star.length; t++) {
      const tx = star.pos.x - star.dx * t
      const ty = star.pos.y - star.dy * t
      const colorIndex = Math.min(t - 1, SHOOTING_STAR_TRAIL_COLORS.length - 1)
      map.set(posKey(tx, ty), {
        char: trailChar,
        color: SHOOTING_STAR_TRAIL_COLORS[colorIndex],
      })
    }
  }

  // Build a set of meteorite positions
  const meteoritePositions = new Set<string>()
  for (const m of state.meteorites) {
    meteoritePositions.add(posKey(m.pos.x, m.pos.y))
  }

  // Build a map of ground omnibox positions for rendering
  const groundOmniboxMap = new Map<string, string>()
  for (const go of state.groundOmniboxes) {
    groundOmniboxMap.set(posKey(go.pos.x, go.pos.y), go.uid)
  }

  // Build a map of character positions for rendering
  const characterMap = new Map<string, { glyph: string; color: string }>()
  for (const c of state.characters) {
    const def = getCharacterDefinition(c.definitionId)
    characterMap.set(posKey(c.pos.x, c.pos.y), { glyph: def.glyph, color: def.glyphColor })
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
      explosionMap.set(posKey(explosion.pos.x, explosion.pos.y), { char, color })
    } else {
      for (let dy = -currentRadius; dy <= currentRadius; dy++) {
        for (let dx = -currentRadius; dx <= currentRadius; dx++) {
          // Only ring positions (not filled circle)
          if (Math.abs(dx) !== currentRadius && Math.abs(dy) !== currentRadius) continue
          const ex = explosion.pos.x + dx
          const ey = explosion.pos.y + dy
          if (isInBounds(ex, ey, state.mapWidth, state.mapHeight)) {
            explosionMap.set(posKey(ex, ey), { char, color })
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
      const isOutOfBounds = !isInBounds(mx, my, state.mapWidth, state.mapHeight)
      if (isOutOfBounds || map[my][mx].type === TileType.Space) {
        const spaceKey = posKey(mx, my)
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

      const tileKey = posKey(mx, my)
      const isCursor = mx === state.cursorTile?.x && my === state.cursorTile?.y
      const isFacingOmnibox = mx === state.facingOmniboxPos?.x && my === state.facingOmniboxPos?.y

      // Resolve what to draw at this tile — priority order determines z-index
      let char: string
      let color: string
      let cursorable = true

      const shootingStarOnLand = targetedStarMap.get(tileKey)
      const previewTile = previewMap.get(tileKey)

      if (mx === player.x && my === player.y) {
        if (previewTile) {
          ctx.fillStyle = previewTile.color
          ctx.fillText(previewTile.char, px, py)
        }
        char = PLAYER_CHAR
        color = PLAYER_COLOR
        cursorable = false
      } else if (characterMap.has(tileKey)) {
        const ch = characterMap.get(tileKey)
        char = ch?.glyph ?? 'G'
        color = ch?.color ?? '#FFFFFF'
      } else if (shootingStarOnLand) {
        char = shootingStarOnLand.char
        color = shootingStarOnLand.color
        cursorable = false
      } else if (previewTile) {
        char = previewTile.char
        color = previewTile.color
      } else if (beePositions.has(tileKey)) {
        char = BEE_CHAR
        color = BEE_COLOR
      } else if (explosionMap.has(tileKey)) {
        const ep = explosionMap.get(tileKey)
        char = ep?.char ?? '*'
        color = ep?.color ?? '#FFD700'
      } else if (meteoritePositions.has(tileKey)) {
        char = METEORITE_CHAR
        color = METEORITE_COLOR
      } else if (groundOmniboxMap.has(tileKey)) {
        const omniboxDef = getDefinition('omnibox')
        char = omniboxDef.glyph
        color = omniboxDef.glyphColor
      } else if (groundItemMap.has(tileKey)) {
        const defId = groundItemMap.get(tileKey)
        if (defId) {
          const def = getDefinition(defId)
          char = def.glyph
          color = def.glyphColor
        } else {
          const tile = map[my][mx]
          char = TILE_CHARS[tile.type]
          color = TILE_COLORS[tile.type]
        }
      } else if (pathPositions.has(tileKey)) {
        char = '\u00b7'
        color = '#ff69b4'
      } else {
        const tile = map[my][mx]
        char = TILE_CHARS[tile.type]
        color = TILE_COLORS[tile.type]
      }

      // Draw with cursor/facing inversion if applicable
      if ((isCursor && cursorable) || isFacingOmnibox) {
        ctx.fillStyle = '#ff69b4'
        ctx.fillRect(px, py, charWidth, charHeight)
        ctx.fillStyle = BG_COLOR
      } else {
        ctx.fillStyle = color
      }
      ctx.fillText(char, px, py)
    }
  }

  // Rain overlay pass — draw animated rain near characters
  for (const c of state.characters) {
    const cx = c.pos.x
    const cy = c.pos.y

    for (let dy = -RAIN_RADIUS; dy <= RAIN_RADIUS; dy++) {
      for (let dx = -RAIN_RADIUS; dx <= RAIN_RADIUS; dx++) {
        // Circular radius check
        if (dx * dx + dy * dy > RAIN_RADIUS * RAIN_RADIUS) continue

        const wx = cx + dx
        const wy = cy + dy

        // Skip off-screen tiles
        const vx = wx - camera.x
        const vy = wy - camera.y
        if (vx < 0 || vx >= viewportWidth || vy < 0 || vy >= viewportHeight) continue

        // Skip the character's own tile and the player tile
        if (wx === cx && wy === cy) continue
        if (wx === player.x && wy === player.y) continue

        // Per-tile seed mixed with rainSeed so pattern varies per game load
        const h = starHash(wx + state.rainSeed, wy)
        if (h % RAIN_DENSITY !== 0) continue

        // Animate: offset by time so drops appear to fall
        const phase = ((h >> 4) + Math.floor(time * RAIN_SPEED)) % RAIN_CHARS.length
        const colorPhase = ((h >> 8) + Math.floor(time * RAIN_SPEED * 0.7)) % RAIN_COLORS.length

        const rpx = vx * charWidth
        const rpy = vy * charHeight
        ctx.fillStyle = RAIN_COLORS[colorPhase]
        ctx.fillText(RAIN_CHARS[phase], rpx, rpy)
      }
    }
  }
}
