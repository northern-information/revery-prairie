import { getCharacterDefinition } from './characters'
import { ComponentType } from './ecs'
import {
  BEE_CHAR,
  BEE_COLOR,
  BG_COLOR,
  CRUMBLE_CHARS,
  CRUMBLE_COLORS,
  CRUMBLE_DURATION_MS,
  EXPLOSION_CHARS,
  EXPLOSION_COLORS,
  EXPLOSION_DURATION_MS,
  EXPLOSION_RADIUS,
  FONT,
  METEORITE_CHAR,
  METEORITE_COLOR,
  PICKUP_EFFECT_BLOOM_MS,
  PICKUP_EFFECT_CHARS_FILL,
  PICKUP_EFFECT_CHARS_RING,
  PICKUP_EFFECT_COLORS,
  PICKUP_EFFECT_DURATION_MS,
  PICKUP_EFFECT_RADIUS,
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
import { TileType, Zone } from './types'

import type { CharMetrics, GameState } from './types'

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
const RAIN_DENSITY = 3 // ~1 in 3 tiles has a visible raindrop
const RAIN_SPEED = 0.008 // cycles per millisecond — fast falling feel

const STAR_CHARS = ['.', '+', '*']
const STAR_COLORS = ['#333', '#555', '#777', '#999', '#bbb', '#999', '#777', '#555']
const STAR_DENSITY = 12 // ~1 in 12 tiles gets a star
const TWINKLE_SPEED = 0.0015 // cycles per millisecond

export { type CharMetrics } from './types'

export const measureChar = (ctx: CanvasRenderingContext2D): CharMetrics => {
  ctx.font = FONT
  const metrics = ctx.measureText('M')
  const charWidth = metrics.width
  const charHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 2
  return { charWidth, charHeight }
}

export const render = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  const { camera, viewportWidth, viewportHeight, map, player } = state
  const { charWidth, charHeight } = metrics

  const pxWidth = viewportWidth * charWidth
  const pxHeight = viewportHeight * charHeight
  ctx.clearRect(0, 0, pxWidth, pxHeight)
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, pxWidth, pxHeight)

  ctx.font = FONT
  ctx.textBaseline = 'top'

  // Build a set of bee positions for fast lookup (from ECS)
  const beePositions = new Set<string>()
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'bee') continue
    const bpos = state.world.getComponent(eid, ComponentType.Position)
    if (bpos) beePositions.add(posKey(bpos.x, bpos.y))
  }

  // Build a map of ground item positions for rendering (from ECS)
  const groundItemMap = new Map<string, string>()
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position, ComponentType.ItemDrop)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundItem') continue
    const gpos = state.world.getComponent(eid, ComponentType.Position)
    const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
    if (gpos && drop) groundItemMap.set(posKey(gpos.x, gpos.y), drop.definitionId)
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

  // Build a set of waypoint positions for distinct markers
  const waypointPositions = new Set<string>()
  for (const w of state.pathWaypoints) {
    waypointPositions.add(posKey(w.x, w.y))
  }

  // Build a set of hover path positions for preview rendering
  const hoverPathPositions = new Set<string>()
  if (state.hoverPath) {
    for (const p of state.hoverPath) {
      hoverPathPositions.add(posKey(p.x, p.y))
    }
  }

  // Build maps of shooting star pixels — targeted stars render over land, others only on space
  const shootingStarMap = new Map<string, { char: string; color: string }>()
  const targetedStarMap = new Map<string, { char: string; color: string }>()
  for (const eid of state.world.query(ComponentType.ShootingStarData, ComponentType.Position, ComponentType.Velocity)) {
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const vel = state.world.getComponent(eid, ComponentType.Velocity)
    const data = state.world.getComponent(eid, ComponentType.ShootingStarData)
    if (!pos || !vel || !data) continue
    const map = data.landingTarget ? targetedStarMap : shootingStarMap
    // Head
    map.set(posKey(pos.x, pos.y), {
      char: SHOOTING_STAR_HEAD_CHAR,
      color: SHOOTING_STAR_HEAD_COLOR,
    })
    // Trail — step backward along negated velocity
    const trailChar = SHOOTING_STAR_TRAIL_CHARS[posKey(vel.dx, vel.dy)] ?? '-'
    for (let t = 1; t <= data.length; t++) {
      const tx = pos.x - vel.dx * t
      const ty = pos.y - vel.dy * t
      const colorIndex = Math.min(t - 1, SHOOTING_STAR_TRAIL_COLORS.length - 1)
      map.set(posKey(tx, ty), {
        char: trailChar,
        color: SHOOTING_STAR_TRAIL_COLORS[colorIndex],
      })
    }
  }

  // Build a set of meteorite positions (from ECS)
  const meteoritePositions = new Set<string>()
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'meteorite') continue
    const mpos = state.world.getComponent(eid, ComponentType.Position)
    if (mpos) meteoritePositions.add(posKey(mpos.x, mpos.y))
  }

  // Build a map of ground omnibox positions for rendering (from ECS)
  const groundOmniboxMap = new Map<string, string>()
  for (const eid of state.world.query(ComponentType.OmniboxLink, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundOmnibox') continue
    const goPos = state.world.getComponent(eid, ComponentType.Position)
    const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
    if (goPos && link) groundOmniboxMap.set(posKey(goPos.x, goPos.y), link.uid)
  }

  // Build a map of character positions for rendering (from ECS)
  const characterMap = new Map<string, { glyph: string; color: string }>()
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (!pos || !identity) continue
    const key = posKey(pos.x, pos.y)
    // Hide characters in masked hidden chamber until wall is broken
    if (!state.caveRevealed && state.caveHiddenPositions.has(key)) continue
    const def = getCharacterDefinition(identity.definitionId)
    characterMap.set(key, { glyph: def.glyph, color: def.glyphColor })
  }

  // Build a map of explosion pixels (from ECS)
  const explosionMap = new Map<string, { char: string; color: string }>()
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'explosion') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!pos || !effect) continue

    const elapsed = time - effect.startTime
    const progress = Math.min(elapsed / EXPLOSION_DURATION_MS, 1)
    const currentRadius = Math.floor(progress * EXPLOSION_RADIUS)
    const charIndex = Math.min(Math.floor(progress * EXPLOSION_CHARS.length), EXPLOSION_CHARS.length - 1)
    const colorIndex = Math.min(Math.floor(progress * EXPLOSION_COLORS.length), EXPLOSION_COLORS.length - 1)
    const char = EXPLOSION_CHARS[charIndex]
    const color = EXPLOSION_COLORS[colorIndex]

    // Generate particles in a ring at the current radius
    if (currentRadius === 0) {
      explosionMap.set(posKey(pos.x, pos.y), { char, color })
    } else {
      for (let dy = -currentRadius; dy <= currentRadius; dy++) {
        for (let dx = -currentRadius; dx <= currentRadius; dx++) {
          // Only ring positions (not filled circle)
          if (Math.abs(dx) !== currentRadius && Math.abs(dy) !== currentRadius) continue
          const ex = pos.x + dx
          const ey = pos.y + dy
          if (isInBounds(ex, ey, state.mapWidth, state.mapHeight)) {
            explosionMap.set(posKey(ex, ey), { char, color })
          }
        }
      }
    }
  }

  // Build a map of meteorite pickup effect pixels (starlight bloom, from ECS)
  const pickupEffectMap = new Map<string, { char: string; color: string }>()
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'pickupBloom') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!pos || !effect) continue

    const elapsed = time - effect.startTime

    if (elapsed <= PICKUP_EFFECT_BLOOM_MS) {
      // Phase 1: expanding circular ring
      const bloomProgress = elapsed / PICKUP_EFFECT_BLOOM_MS
      const currentRadius = bloomProgress * PICKUP_EFFECT_RADIUS
      const charIndex = Math.min(
        Math.floor(bloomProgress * PICKUP_EFFECT_CHARS_RING.length),
        PICKUP_EFFECT_CHARS_RING.length - 1,
      )
      const colorIndex = Math.min(
        Math.floor(bloomProgress * PICKUP_EFFECT_COLORS.length),
        PICKUP_EFFECT_COLORS.length - 1,
      )
      const char = PICKUP_EFFECT_CHARS_RING[charIndex]
      const color = PICKUP_EFFECT_COLORS[colorIndex]
      const r = Math.ceil(currentRadius)

      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (Math.round(dist) !== Math.round(currentRadius)) continue
          const ex = pos.x + dx
          const ey = pos.y + dy
          if (isInBounds(ex, ey, state.mapWidth, state.mapHeight)) {
            pickupEffectMap.set(posKey(ex, ey), { char, color })
          }
        }
      }
    } else {
      // Phase 2: shimmer fill + fading ring
      const fadeElapsed = elapsed - PICKUP_EFFECT_BLOOM_MS
      const fadeDuration = PICKUP_EFFECT_DURATION_MS - PICKUP_EFFECT_BLOOM_MS
      const fadeProgress = fadeElapsed / fadeDuration
      const colorIndex = Math.min(
        Math.floor((0.5 + fadeProgress * 0.5) * PICKUP_EFFECT_COLORS.length),
        PICKUP_EFFECT_COLORS.length - 1,
      )
      const color = PICKUP_EFFECT_COLORS[colorIndex]

      for (let dy = -PICKUP_EFFECT_RADIUS; dy <= PICKUP_EFFECT_RADIUS; dy++) {
        for (let dx = -PICKUP_EFFECT_RADIUS; dx <= PICKUP_EFFECT_RADIUS; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > PICKUP_EFFECT_RADIUS + 0.5) continue
          const ex = pos.x + dx
          const ey = pos.y + dy
          if (!isInBounds(ex, ey, state.mapWidth, state.mapHeight)) continue

          if (Math.round(dist) === PICKUP_EFFECT_RADIUS) {
            // Outer ring fades with ·
            pickupEffectMap.set(posKey(ex, ey), { char: '\u00b7', color })
          } else {
            // Interior shimmer: alternate chars based on position hash + time
            const h = starHash(ex, ey)
            const shimmerIndex =
              (h + Math.floor(time * 0.01)) % PICKUP_EFFECT_CHARS_FILL.length
            pickupEffectMap.set(posKey(ex, ey), {
              char: PICKUP_EFFECT_CHARS_FILL[shimmerIndex],
              color,
            })
          }
        }
      }
    }
  }

  // Build a map of crumble effect pixels (breakable wall, from ECS)
  const crumbleMap = new Map<string, { char: string; color: string }>()
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'crumble') continue
    const multiPos = state.world.getComponent(eid, ComponentType.MultiPosition)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!multiPos || !effect) continue

    const elapsed = time - effect.startTime
    const progress = Math.min(elapsed / CRUMBLE_DURATION_MS, 1)
    const charIndex = Math.min(Math.floor(progress * CRUMBLE_CHARS.length), CRUMBLE_CHARS.length - 1)
    const colorIndex = Math.min(Math.floor(progress * CRUMBLE_COLORS.length), CRUMBLE_COLORS.length - 1)
    const crChar = CRUMBLE_CHARS[charIndex]
    const crColor = CRUMBLE_COLORS[colorIndex]
    for (const pos of multiPos.positions) {
      crumbleMap.set(posKey(pos.x, pos.y), { char: crChar, color: crColor })
    }
  }

  for (let vy = 0; vy < viewportHeight; vy++) {
    for (let vx = 0; vx < viewportWidth; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy

      const px = vx * charWidth
      const py = vy * charHeight

      // Out-of-bounds and Space tiles render as twinkling stars (overworld) or dark void (cave)
      const isOutOfBounds = !isInBounds(mx, my, state.mapWidth, state.mapHeight)
      if (isOutOfBounds || map[my][mx].type === TileType.Space) {
        if (state.currentZone === Zone.Cave) {
          // Cave: just leave the dark background
          continue
        }
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
      const isFacingEntity = mx === state.facingEntityPos?.x && my === state.facingEntityPos?.y
      const isPendingTarget =
        mx === state.pendingInteractionTarget?.x && my === state.pendingInteractionTarget?.y

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
      } else if (pickupEffectMap.has(tileKey)) {
        const pe = pickupEffectMap.get(tileKey)
        char = pe?.char ?? '*'
        color = pe?.color ?? '#C8C8FF'
      } else if (crumbleMap.has(tileKey)) {
        const cr = crumbleMap.get(tileKey)
        char = cr?.char ?? '#'
        color = cr?.color ?? '#997755'
      } else if (meteoritePositions.has(tileKey)) {
        char = METEORITE_CHAR
        if (pathPositions.has(tileKey)) {
          color = '#ff69b4'
        } else if (hoverPathPositions.has(tileKey)) {
          color = '#555555'
        } else {
          color = METEORITE_COLOR
        }
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
        const pathTile = map[my][mx]
        if (pathTile.type === TileType.CaveEntrance) {
          char = TILE_CHARS[TileType.CaveEntrance]
          color = '#ff69b4'
        } else {
          char = waypointPositions.has(tileKey) ? '+' : '\u00b7'
          color = '#ff69b4'
        }
      } else if (hoverPathPositions.has(tileKey)) {
        const hoverTile = map[my][mx]
        char = TILE_CHARS[hoverTile.type]
        color = '#555555'
      } else {
        // Mask hidden chamber tiles as CaveWall until revealed
        if (!state.caveRevealed && state.caveHiddenPositions.has(tileKey)) {
          char = TILE_CHARS[TileType.CaveWall]
          color = TILE_COLORS[TileType.CaveWall]
        } else {
          const tile = map[my][mx]
          char = TILE_CHARS[tile.type]
          color = TILE_COLORS[tile.type]
        }
      }

      // Draw with cursor/facing inversion if applicable
      if ((isCursor && cursorable) || isFacingEntity || isPendingTarget) {
        ctx.fillStyle = '#ff69b4'
        ctx.fillRect(px, py, charWidth, charHeight)
        ctx.fillStyle = BG_COLOR
      } else {
        ctx.fillStyle = color
      }
      ctx.fillText(char, px, py)
    }
  }

  // Rain overlay pass — draw animated rain near entities with rain aura (from ECS)
  for (const eid of state.world.query(ComponentType.Aura, ComponentType.Position)) {
    const aura = state.world.getComponent(eid, ComponentType.Aura)
    if (aura?.kind !== 'rain') continue
    const auraPos = state.world.getComponent(eid, ComponentType.Position)
    if (!auraPos) continue
    const cx = auraPos.x
    const cy = auraPos.y
    const rainRadius = aura.radius

    for (let dy = -rainRadius; dy <= rainRadius; dy++) {
      for (let dx = -rainRadius; dx <= rainRadius; dx++) {
        // Circular radius check
        if (dx * dx + dy * dy > rainRadius * rainRadius) continue

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
