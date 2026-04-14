import { getAngelRenderData } from './angelAnimation'
import { getCharacterDefinition } from './characters'
import {
  ACTION_COLOR,
  ANGEL_AURA_RADIUS,
  ANGEL_BODY_SIZE,
  BASE_FONT_SIZE,
  BEE_CHAR,
  BEE_COLOR,
  BEEHIVE_CHAR,
  BEEHIVE_COLOR,
  BG_COLOR,
  DEEP_TIME_TRANSITION_GLYPH_DURATION_MS,
  BURN_SCAR_COLORS,
  CLOVER_BLACK_COLOR,
  CLOVER_BROWN_COLOR,
  CLOVER_DECOMPOSE_COLOR,
  CLOVER_DYING_COLOR_FROM,
  CLOVER_DYING_COLOR_TO,
  CLOVER_DYING_OSCILLATION_SPEED,
  CLOVER_HEALTHY_COLORS,
  CLOVER_PREVIEW_BLINK_SPEED,
  CLOVER_PREVIEW_COLORS,
  COIN_DULL_COLOR,
  CRUMBLE_CHARS,
  CRUMBLE_COLORS,
  CRUMBLE_DURATION_MS,
  DIRT_COLORS,
  EARTH_SCAN_COLOR_HIGH,
  EARTH_SCAN_COLOR_LOW,
  EARTH_SCAN_EXPAND_MS,
  EARTH_SCAN_FADE_MS,
  EARTH_SCAN_HOLD_MS,
  EARTH_SCAN_RADIUS,
  EXPLOSION_CHARS,
  EXPLOSION_COLORS,
  EXPLOSION_DURATION_MS,
  EXPLOSION_RADIUS,
  GLINT_ZONE_CHARS,
  GLINT_ZONE_COLORS,
  GLINT_ZONE_DENSITY,
  GLINT_ZONE_SPEED,
  HOVER_PATH_COLOR,
  LIGHTNING_BOLT_COLOR_BRIGHT,
  LIGHTNING_BOLT_COLOR_DIM,
  LIGHTNING_BOLT_COLOR_MID,
  LIGHTNING_DURATION_MS,
  LIGHTNING_FLASH_MS,
  LIGHTNING_IMPACT_CHARS,
  LIGHTNING_IMPACT_COLORS,
  LIGHTNING_RANGE_HIGHLIGHT_COLOR,
  LIGHTNING_REVERY_RANGE,
  LIGHTNING_SCREEN_FLASH_MS,
  LIGHTNING_SCREEN_FLASH_OPACITY,
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
  POND_COLOR,
  RAIN_AURA_CHARS,
  RAIN_AURA_COLORS,
  RAIN_AURA_DENSITY,
  RAIN_AURA_SPEED,
  RIVER_COLOR,
  SAND_COLORS,
  SHOOTING_STAR_HEAD_CHAR,
  SHOOTING_STAR_HEAD_COLOR,
  SHOOTING_STAR_TRAIL_CHARS,
  SHOOTING_STAR_TRAIL_COLORS,
  SOIL_HEALTH_DEFAULT,
  TILE_CHARS,
  TILE_COLORS,
  TRAIL_DURATION_MS,
  WEATHER_RAIN_DENSITY,
  WILDFIRE_CHARS,
  WILDFIRE_COLORS,
  WILDFIRE_DURATION_MS,
} from './constants'
import { ComponentType } from './ecs/types'
import { GENESIS_EPOCHS } from './genesis'
import { renderGenesis } from './genesisRenderer'
import { getDefinition } from './items'
import { isInBounds, posKey, tileHash } from './position'
import { getReveryDefinition } from './reveries'
import { isInRainFront } from './tileWater'
import { CloverStage, DeepTimePhase, TileType, Zone } from './types'

import type { VelocityKey } from './constants'
import type { CharMetrics, GameState, TransitionFade } from './types'

/** Compute transition progress (0→1) from a TransitionFade, or 1 if null. */
const getTransitionAlpha = (transition: TransitionFade | null, time: number): number => {
  if (!transition) return 1
  if (transition.duration <= 0) return 1
  const elapsed = time - transition.startTime
  if (elapsed <= 0) return 0
  if (elapsed >= transition.duration) return 1
  return elapsed / transition.duration
}

const STAR_CHARS = ['.', '+', '*']
const STAR_COLORS = ['#333', '#555', '#777', '#999', '#bbb', '#999', '#777', '#555']
const STAR_DENSITY = 12 // ~1 in 12 tiles gets a star
const TWINKLE_SPEED = 0.0015 // cycles per millisecond

export { type CharMetrics } from './types'

export const measureChar = (ctx: CanvasRenderingContext2D, zoom = 1): CharMetrics => {
  const font = `${String(Math.round(BASE_FONT_SIZE * zoom))}px monospace`
  ctx.font = font
  const metrics = ctx.measureText('M')
  const charWidth = metrics.width
  const charHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 2
  return { charWidth, charHeight, font }
}

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

const lerpColor = (from: string, to: string, t: number): string => {
  const [fr, fg, fb] = hexToRgb(from)
  const [tr, tg, tb] = hexToRgb(to)
  const r = Math.round(fr + (tr - fr) * t)
  const g = Math.round(fg + (tg - fg) * t)
  const b = Math.round(fb + (tb - fb) * t)
  return `rgb(${String(r)},${String(g)},${String(b)})`
}

// Map soil health (0–100) to red → green gradient
const soilHealthColor = (health: number): string => {
  const t = Math.max(0, Math.min(health / 100, 1))
  return lerpColor(EARTH_SCAN_COLOR_LOW, EARTH_SCAN_COLOR_HIGH, t)
}

// ── Pooled render collections ──
// Reused every frame to avoid per-frame allocation / GC pressure.
const _beePositions = new Set<string>()
const _groundItemMap = new Map<string, { definitionId: string; glinting?: boolean }>()
const _previewMap = new Map<string, { char: string; color: string; isValid: boolean }>()
const _pathPositions = new Set<string>()
const _waypointPositions = new Set<string>()
const _hoverPathPositions = new Set<string>()
const _devPaintPositions = new Set<string>()
const _shootingStarMap = new Map<string, { char: string; color: string }>()
const _targetedStarMap = new Map<string, { char: string; color: string }>()
const _meteoritePositions = new Set<string>()
const _beehivePositions = new Set<string>()
const _characterMap = new Map<string, { glyph: string; color: string }>()
const _angelMap = new Map<string, { char: string; color: string }>()
const _angelTileToGroup = new Map<string, Set<string>>()
const _trailMap = new Map<string, number>()
const _explosionMap = new Map<string, { char: string; color: string }>()
const _lightningMap = new Map<string, { char: string; color: string }>()
const _wildfireMap = new Map<string, { char: string; color: string }>()
const _pickupEffectMap = new Map<string, { char: string; color: string }>()
const _reveryCastMap = new Map<string, { char: string; color: string }>()
const _earthScanBgMap = new Map<string, { color: string; opacity: number }>()
const _crumbleMap = new Map<string, { char: string; color: string }>()

export const render = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  // Genesis mode — delegate to genesis renderer
  if (state.genesis && state.genesis.epochIndex < GENESIS_EPOCHS.length) {
    renderGenesis(ctx, state.genesis, GENESIS_EPOCHS, metrics, state.viewportWidth, state.viewportHeight, time)
    return
  }

  const { camera, viewportWidth, viewportHeight, map, player } = state
  const { charWidth, charHeight } = metrics

  // Genesis-to-gameplay crossfade: entities not visible in genesis fade in
  const transitionAlpha = getTransitionAlpha(state.genesisTransition, time)
  const isTransitioning = transitionAlpha < 1

  const pxWidth = viewportWidth * charWidth
  const pxHeight = viewportHeight * charHeight
  ctx.clearRect(0, 0, pxWidth, pxHeight)
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, pxWidth, pxHeight)

  ctx.font = metrics.font
  ctx.textBaseline = 'top'

  // Zone filter helper — only render entities in the current zone
  const zone = state.currentZone
  const inZone = (eid: number): boolean => state.world.getComponent(eid, ComponentType.EntityZone)?.zone === zone

  // Clear pooled collections for this frame
  _beePositions.clear()
  _groundItemMap.clear()
  _previewMap.clear()
  _pathPositions.clear()
  _waypointPositions.clear()
  _hoverPathPositions.clear()
  _devPaintPositions.clear()
  _shootingStarMap.clear()
  _targetedStarMap.clear()
  _meteoritePositions.clear()
  _beehivePositions.clear()
  _characterMap.clear()
  _angelMap.clear()
  _angelTileToGroup.clear()
  _trailMap.clear()
  _explosionMap.clear()
  _lightningMap.clear()
  _wildfireMap.clear()
  _pickupEffectMap.clear()
  _reveryCastMap.clear()
  _earthScanBgMap.clear()
  _crumbleMap.clear()

  // Alias pooled collections for readability
  const beePositions = _beePositions
  const groundItemMap = _groundItemMap
  const previewMap = _previewMap
  const pathPositions = _pathPositions
  const waypointPositions = _waypointPositions
  const hoverPathPositions = _hoverPathPositions
  const devPaintPositions = _devPaintPositions
  const shootingStarMap = _shootingStarMap
  const targetedStarMap = _targetedStarMap
  const meteoritePositions = _meteoritePositions
  const beehivePositions = _beehivePositions
  const characterMap = _characterMap
  const angelMap = _angelMap
  const angelTileToGroup = _angelTileToGroup
  const trailMap = _trailMap
  const explosionMap = _explosionMap
  const lightningMap = _lightningMap
  const wildfireMap = _wildfireMap
  const pickupEffectMap = _pickupEffectMap
  const reveryCastMap = _reveryCastMap
  const earthScanBgMap = _earthScanBgMap
  const crumbleMap = _crumbleMap

  // Populate bee positions (from ECS)
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'bee') continue
    if (!inZone(eid)) continue
    const bpos = state.world.getComponent(eid, ComponentType.Position)
    if (bpos) beePositions.add(posKey(bpos.x, bpos.y))
  }

  // Populate ground item positions (from ECS)
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position, ComponentType.ItemDrop)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'groundItem') continue
    if (!inZone(eid)) continue
    const gpos = state.world.getComponent(eid, ComponentType.Position)
    const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
    if (gpos && drop)
      groundItemMap.set(posKey(gpos.x, gpos.y), { definitionId: drop.definitionId, glinting: drop.glinting })
  }

  // Populate preview tile positions for macro recipe previews
  if (state.previewFn) {
    for (const pt of state.previewFn(state, time)) {
      previewMap.set(posKey(pt.pos.x, pt.pos.y), { char: pt.char, color: pt.color, isValid: pt.isValid })
    }
  }

  // Populate path positions for highlight rendering
  if (state.path) {
    for (const p of state.path) {
      pathPositions.add(posKey(p.x, p.y))
    }
  }

  // Populate waypoint positions for distinct markers
  for (const w of state.pathWaypoints) {
    waypointPositions.add(posKey(w.x, w.y))
  }

  // Populate hover path positions for preview rendering (suppressed when dev panel is open)
  if (state.hoverPath && !state.devPanelOpen) {
    for (const p of state.hoverPath) {
      hoverPathPositions.add(posKey(p.x, p.y))
    }
  }

  // Populate dev paint preview positions
  let devPaintTileType: string | null = null
  if (state.devPaintPreview) {
    const { x1, y1, x2, y2 } = state.devPaintPreview
    const minX = Math.max(0, Math.min(x1, x2))
    const maxX = Math.min(state.mapWidth - 1, Math.max(x1, x2))
    const minY = Math.max(0, Math.min(y1, y2))
    const maxY = Math.min(state.mapHeight - 1, Math.max(y1, y2))
    devPaintTileType = state.devPaintPreview.tileType ?? null
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        devPaintPositions.add(posKey(x, y))
      }
    }
  }

  // Populate shooting star pixel maps — targeted stars render over land, others only on space
  for (const eid of state.world.query(ComponentType.ShootingStarData, ComponentType.Position, ComponentType.Velocity)) {
    if (!inZone(eid)) continue
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
    const velKey = posKey(vel.dx, vel.dy) as VelocityKey
    const trailChar = SHOOTING_STAR_TRAIL_CHARS[velKey] ?? '-'
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

  // Populate meteorite positions (from ECS)
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'meteorite') continue
    if (!inZone(eid)) continue
    const mpos = state.world.getComponent(eid, ComponentType.Position)
    if (mpos) meteoritePositions.add(posKey(mpos.x, mpos.y))
  }

  // Populate beehive positions (from ECS)
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'beehive') continue
    if (!inZone(eid)) continue
    const hpos = state.world.getComponent(eid, ComponentType.Position)
    if (hpos) beehivePositions.add(posKey(hpos.x, hpos.y))
  }

  // Populate character positions (from ECS)
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    if (!inZone(eid)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (!pos || !identity) continue
    const key = posKey(pos.x, pos.y)
    // Hide characters in masked hidden chamber until wall is broken
    if (!state.caveRevealed && state.caveHiddenPositions.has(key)) continue
    const def = getCharacterDefinition(identity.definitionId)
    characterMap.set(key, { glyph: def.glyph, color: def.glyphColor })
  }

  // Populate angel body pixels (from ECS)
  // Angel aura center positions for gold aura rendering
  const angelAuraCenters: { x: number; y: number }[] = []
  // Track angel body tile groups so hovering/facing any tile highlights all
  const angelBodyGroups: Set<string>[] = []
  for (const eid of state.world.query(ComponentType.AngelData, ComponentType.Position)) {
    if (!inZone(eid)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const data = state.world.getComponent(eid, ComponentType.AngelData)
    if (!pos || !data) continue
    const anchorX = pos.x - Math.floor(ANGEL_BODY_SIZE / 2)
    const anchorY = pos.y - Math.floor(ANGEL_BODY_SIZE / 2)
    const group = new Set<string>()
    for (const pixel of getAngelRenderData(data.seed, anchorX, anchorY, time)) {
      const key = posKey(pixel.pos.x, pixel.pos.y)
      angelMap.set(key, { char: pixel.char, color: pixel.color })
      group.add(key)
    }
    angelBodyGroups.push(group)
    for (const key of group) {
      angelTileToGroup.set(key, group)
    }
    angelAuraCenters.push({ x: pos.x, y: pos.y })
  }

  // Prune expired trail points and populate trail map with opacity
  const activeTrail = state.trail.filter(tp => {
    const age = time - tp.time
    if (age >= TRAIL_DURATION_MS) return false
    trailMap.set(posKey(tp.x, tp.y), 1 - age / TRAIL_DURATION_MS)
    return true
  })
  state.trail = activeTrail

  // Populate explosion pixels (from ECS)
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!inZone(eid)) continue
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

  // Populate lightning bolt pixels (from ECS)
  let lightningFlashElapsed = Infinity
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!inZone(eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'lightning') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    const data = state.world.getComponent(eid, ComponentType.LightningData)
    if (!effect || !data) continue

    const elapsed = time - effect.startTime
    if (elapsed >= LIGHTNING_DURATION_MS) continue
    lightningFlashElapsed = Math.min(lightningFlashElapsed, elapsed)

    const { path, branch } = data

    // Determine bolt character for a segment based on dx from previous to current
    const boltChar = (dx: number): string => (dx === 0 ? '|' : dx > 0 ? '\\' : '/')

    // Phase 1: Flash (0 to LIGHTNING_FLASH_MS) — all bright white
    // Phase 2: Glow (LIGHTNING_FLASH_MS to 500ms) — dimming with flicker
    // Phase 3: Fade (500ms to LIGHTNING_DURATION_MS) — bottom-to-top disappearance
    if (elapsed < LIGHTNING_FLASH_MS) {
      // Flash: all segments bright white
      for (let i = 0; i < path.length; i++) {
        const dx = i > 0 ? path[i].x - path[i - 1].x : 0
        lightningMap.set(posKey(path[i].x, path[i].y), { char: boltChar(dx), color: LIGHTNING_BOLT_COLOR_BRIGHT })
      }
      if (branch) {
        for (const bp of branch) {
          lightningMap.set(posKey(bp.x, bp.y), { char: '/', color: LIGHTNING_BOLT_COLOR_BRIGHT })
        }
      }
      // Impact ring
      const impact = path[path.length - 1]
      lightningMap.set(posKey(impact.x, impact.y), {
        char: LIGHTNING_IMPACT_CHARS[0],
        color: LIGHTNING_IMPACT_COLORS[0],
      })
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          if (Math.abs(dx) + Math.abs(dy) === 1) {
            lightningMap.set(posKey(impact.x + dx, impact.y + dy), {
              char: LIGHTNING_IMPACT_CHARS[1],
              color: LIGHTNING_IMPACT_COLORS[1],
            })
          }
        }
      }
    } else if (elapsed < 500) {
      // Glow: dimming with flicker
      const flickerOn = Math.floor(time / 80) % 2 === 0
      const color = flickerOn ? LIGHTNING_BOLT_COLOR_MID : LIGHTNING_BOLT_COLOR_DIM
      for (let i = 0; i < path.length; i++) {
        const dx = i > 0 ? path[i].x - path[i - 1].x : 0
        lightningMap.set(posKey(path[i].x, path[i].y), { char: boltChar(dx), color })
      }
      if (branch) {
        for (const bp of branch) {
          lightningMap.set(posKey(bp.x, bp.y), { char: '/', color })
        }
      }
      // Fading impact
      const impact = path[path.length - 1]
      const impactProgress = (elapsed - LIGHTNING_FLASH_MS) / (500 - LIGHTNING_FLASH_MS)
      const impactCharIdx = Math.min(
        Math.floor(impactProgress * LIGHTNING_IMPACT_CHARS.length),
        LIGHTNING_IMPACT_CHARS.length - 1
      )
      const impactColorIdx = Math.min(
        Math.floor(impactProgress * LIGHTNING_IMPACT_COLORS.length),
        LIGHTNING_IMPACT_COLORS.length - 1
      )
      lightningMap.set(posKey(impact.x, impact.y), {
        char: LIGHTNING_IMPACT_CHARS[impactCharIdx],
        color: LIGHTNING_IMPACT_COLORS[impactColorIdx],
      })
    } else {
      // Fade: segments disappear bottom-to-top
      const fadeProgress = (elapsed - 500) / (LIGHTNING_DURATION_MS - 500)
      const visibleCount = Math.max(0, Math.floor(path.length * (1 - fadeProgress)))
      for (let i = 0; i < visibleCount; i++) {
        const dx = i > 0 ? path[i].x - path[i - 1].x : 0
        lightningMap.set(posKey(path[i].x, path[i].y), { char: boltChar(dx), color: LIGHTNING_BOLT_COLOR_DIM })
      }
    }
  }

  // Populate wildfire pixels (from ECS)
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!inZone(eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'wildfire') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (!effect || !multi) continue

    const elapsed = time - effect.startTime
    if (elapsed >= WILDFIRE_DURATION_MS) continue
    const progress = elapsed / WILDFIRE_DURATION_MS

    for (const pos of multi.positions) {
      const h = tileHash(pos.x, pos.y)
      if (progress < 0.6) {
        // Active fire: cycling chars and colors
        const charIdx = (h + Math.floor(time * 0.01)) % WILDFIRE_CHARS.length
        const colorIdx = (h + Math.floor(time * 0.008)) % WILDFIRE_COLORS.length
        wildfireMap.set(posKey(pos.x, pos.y), { char: WILDFIRE_CHARS[charIdx], color: WILDFIRE_COLORS[colorIdx] })
      } else {
        // Fade to BurntClover
        const fadeProgress = (progress - 0.6) / 0.4
        const colorIdx = Math.min(Math.floor(fadeProgress * WILDFIRE_COLORS.length), WILDFIRE_COLORS.length - 1)
        wildfireMap.set(posKey(pos.x, pos.y), {
          char: '%',
          color: WILDFIRE_COLORS[WILDFIRE_COLORS.length - 1 - colorIdx],
        })
      }
    }
  }

  // Populate meteorite pickup effect pixels (starlight bloom, from ECS)
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!inZone(eid)) continue
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
        PICKUP_EFFECT_CHARS_RING.length - 1
      )
      const colorIndex = Math.min(
        Math.floor(bloomProgress * PICKUP_EFFECT_COLORS.length),
        PICKUP_EFFECT_COLORS.length - 1
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
        PICKUP_EFFECT_COLORS.length - 1
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
            const h = tileHash(ex, ey)
            const shimmerIndex = (h + Math.floor(time * 0.01)) % PICKUP_EFFECT_CHARS_FILL.length
            pickupEffectMap.set(posKey(ex, ey), {
              char: PICKUP_EFFECT_CHARS_FILL[shimmerIndex],
              color,
            })
          }
        }
      }
    }
  }

  // Populate revery cast effect pixels (tile-style only; rain-style handled in overlay pass)
  const reveryCastRainPositions: { x: number; y: number }[] = []
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!inZone(eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'reveryCast') continue
    const multiPos = state.world.getComponent(eid, ComponentType.MultiPosition)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!multiPos || !effect?.reveryId) continue

    const revDef = getReveryDefinition(effect.reveryId)
    const elapsed = time - effect.startTime

    if (revDef.castStyle === 'scan') {
      // Scan-style: handled separately in the earth scan pass
      continue
    } else if (revDef.castStyle === 'rain') {
      // Rain-style: collect tile positions for the overlay pass
      for (const pos of multiPos.positions) {
        reveryCastRainPositions.push({ x: pos.x, y: pos.y })
      }
    } else {
      // Tile-style: replace the tile glyph
      for (const pos of multiPos.positions) {
        const h = tileHash(pos.x, pos.y)
        const frameIndex = (Math.floor(elapsed / 200) + (h % revDef.glyphs.length)) % revDef.glyphs.length
        reveryCastMap.set(posKey(pos.x, pos.y), {
          char: revDef.glyphs[frameIndex],
          color: revDef.glyphColor,
        })
      }
    }
  }

  // Populate earth scan background colors (scan-style revery)
  // This is a background layer — tiles get a colored fillRect, then normal content draws on top
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!inZone(eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'reveryCast') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!effect?.reveryId || effect.reveryId !== 'earth') continue
    const origin = state.world.getComponent(eid, ComponentType.Position)
    if (!origin) continue

    const elapsed = time - effect.startTime
    const totalDuration = EARTH_SCAN_EXPAND_MS + EARTH_SCAN_HOLD_MS + EARTH_SCAN_FADE_MS

    // Determine which phase we're in
    const isExpanding = elapsed <= EARTH_SCAN_EXPAND_MS
    const isHolding = !isExpanding && elapsed <= EARTH_SCAN_EXPAND_MS + EARTH_SCAN_HOLD_MS
    const isFading = !isExpanding && !isHolding && elapsed <= totalDuration

    if (!isExpanding && !isHolding && !isFading) continue

    // During fade, the wave front progresses from center outward
    const fadeElapsed = isFading ? elapsed - EARTH_SCAN_EXPAND_MS - EARTH_SCAN_HOLD_MS : 0
    const fadeWaveRadius = isFading ? (fadeElapsed / EARTH_SCAN_FADE_MS) * EARTH_SCAN_RADIUS : 0

    for (let vy = 0; vy < viewportHeight; vy++) {
      for (let vx = 0; vx < viewportWidth; vx++) {
        const mx = camera.x + vx
        const my = camera.y + vy
        if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue

        const tileType = map[my][mx].type
        if (tileType === TileType.Space || tileType === TileType.CaveWall || tileType === TileType.CaveBreakableWall)
          continue

        const key = posKey(mx, my)

        const dx = mx - origin.x
        const dy = my - origin.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (isExpanding) {
          const expandRadius = (elapsed / EARTH_SCAN_EXPAND_MS) * EARTH_SCAN_RADIUS
          if (dist > expandRadius) continue
        } else if (dist > EARTH_SCAN_RADIUS) {
          continue
        }

        let tileOpacity = 1
        if (isFading) {
          const fadeEdge = fadeWaveRadius
          if (dist < fadeEdge - 3) {
            continue
          } else if (dist < fadeEdge) {
            tileOpacity = (dist - (fadeEdge - 3)) / 3
          }
        }

        const health = state.soilHealth.get(key) ?? SOIL_HEALTH_DEFAULT

        earthScanBgMap.set(key, {
          color: soilHealthColor(health),
          opacity: tileOpacity,
        })
      }
    }
  }

  // Populate crumble effect pixels (breakable wall, from ECS)
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!inZone(eid)) continue
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

  // Pre-pass: earth scan backgrounds — drawn before all glyphs so south-row
  // backgrounds never clip north-row characters.
  if (earthScanBgMap.size > 0) {
    for (let vy = 0; vy < viewportHeight; vy++) {
      for (let vx = 0; vx < viewportWidth; vx++) {
        const key = posKey(camera.x + vx, camera.y + vy)
        const scanBg = earthScanBgMap.get(key)
        if (scanBg) {
          if (scanBg.opacity >= 1) {
            ctx.fillStyle = scanBg.color
          } else {
            ctx.fillStyle = lerpColor(scanBg.color, BG_COLOR, 1 - scanBg.opacity)
          }
          ctx.fillRect(vx * charWidth, vy * charHeight, charWidth, charHeight)
        }
      }
    }
  }

  // Pre-pass: lightning targeting range highlight
  if (state.targetingSlot !== null) {
    for (let vy = 0; vy < viewportHeight; vy++) {
      for (let vx = 0; vx < viewportWidth; vx++) {
        const mx = camera.x + vx
        const my = camera.y + vy
        if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
        if (map[my][mx].type === TileType.Space) continue
        const dist = Math.abs(mx - player.x) + Math.abs(my - player.y)
        if (dist > LIGHTNING_REVERY_RANGE) continue
        ctx.fillStyle = LIGHTNING_RANGE_HIGHLIGHT_COLOR
        ctx.fillRect(vx * charWidth, vy * charHeight, charWidth, charHeight)
      }
    }
  }

  // Pre-pass: angel gold aura background
  if (angelAuraCenters.length > 0) {
    const savedAlpha = ctx.globalAlpha
    for (let vy = 0; vy < viewportHeight; vy++) {
      for (let vx = 0; vx < viewportWidth; vx++) {
        const mx = camera.x + vx
        const my = camera.y + vy
        if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
        if (map[my][mx].type === TileType.Space) continue

        for (const ac of angelAuraCenters) {
          const dx = mx - ac.x
          const dy = my - ac.y
          const distSq = dx * dx + dy * dy
          if (distSq > ANGEL_AURA_RADIUS * ANGEL_AURA_RADIUS) continue

          // Oscillating alpha: gentle sine wave based on time + distance from center
          const dist = Math.sqrt(distSq)
          const wave = Math.sin(time * 0.002 + dist * 0.3) * 0.5 + 0.5 // 0..1
          const falloff = 1 - dist / ANGEL_AURA_RADIUS // 1 at center, 0 at edge
          const alpha = 0.06 + 0.06 * wave * falloff // gentle 0.06..0.12

          ctx.globalAlpha = alpha
          ctx.fillStyle = '#FFD700'
          ctx.fillRect(vx * charWidth, vy * charHeight, charWidth, charHeight)
          break // only one angel aura can contribute per tile
        }
      }
    }
    ctx.globalAlpha = savedAlpha
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
          const h = tileHash(mx, my)
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
      const isPendingTarget = mx === state.pendingInteractionTarget?.x && my === state.pendingInteractionTarget?.y

      // Resolve what to draw at this tile — priority order determines z-index
      let char: string
      let color: string
      let cursorable = true
      // isEntity: true for elements not visible during genesis (ghosts, bees, ground items, etc.)
      // Used during genesis-to-gameplay crossfade to apply fade-in alpha
      let isEntity = false

      const shootingStarOnLand = targetedStarMap.get(tileKey)
      const previewTile = previewMap.get(tileKey)

      if (mx === player.x && my === player.y) {
        if (previewTile) {
          ctx.fillStyle = previewTile.color
          ctx.fillText(previewTile.char, px, py)
        }
        // Deep time glyph crossfade: ö fades out, @ fades in
        if (state.deepTimeTransition && state.deepTime?.active) {
          const glyphElapsed = time - state.deepTimeTransition.startTime
          const glyphT = Math.max(0, Math.min(glyphElapsed / DEEP_TIME_TRANSITION_GLYPH_DURATION_MS, 1))
          // Draw old glyph fading out
          ctx.globalAlpha = 1 - glyphT
          ctx.fillStyle = state.deepTime.playerGlyphColor
          ctx.fillText(state.deepTime.playerGlyph, px, py)
          // Draw new glyph fading in
          ctx.globalAlpha = glyphT
          ctx.fillStyle = PLAYER_COLOR
          ctx.fillText(PLAYER_CHAR, px, py)
          ctx.globalAlpha = 1
          // Skip the normal draw path for this tile
          char = PLAYER_CHAR
          color = PLAYER_COLOR
          cursorable = false
          continue
        }
        char = state.deepTime?.active ? state.deepTime.playerGlyph : PLAYER_CHAR
        color = state.deepTime?.active ? state.deepTime.playerGlyphColor : PLAYER_COLOR
        cursorable = false
      } else if (characterMap.has(tileKey)) {
        const ch = characterMap.get(tileKey)
        char = ch?.glyph ?? 'G'
        color = ch?.color ?? '#FFFFFF'
        isEntity = true
      } else if (beehivePositions.has(tileKey)) {
        char = BEEHIVE_CHAR
        color = BEEHIVE_COLOR
        isEntity = true
      } else if (angelMap.has(tileKey)) {
        const ap = angelMap.get(tileKey)
        char = ap?.char ?? 'O'
        color = ap?.color ?? '#FFFFFF'
        isEntity = true
      } else if (shootingStarOnLand) {
        char = shootingStarOnLand.char
        color = shootingStarOnLand.color
        cursorable = false
      } else if (lightningMap.has(tileKey)) {
        const lp = lightningMap.get(tileKey)
        char = lp?.char ?? '|'
        color = lp?.color ?? '#FFFFFF'
        cursorable = false
      } else if (previewTile) {
        char = previewTile.char
        color = previewTile.color
      } else if (beePositions.has(tileKey)) {
        char = BEE_CHAR
        color = BEE_COLOR
        isEntity = true
      } else if (explosionMap.has(tileKey)) {
        const ep = explosionMap.get(tileKey)
        char = ep?.char ?? '*'
        color = ep?.color ?? '#FFD700'
      } else if (wildfireMap.has(tileKey)) {
        const wf = wildfireMap.get(tileKey)
        char = wf?.char ?? '^'
        color = wf?.color ?? '#FF4500'
      } else if (pickupEffectMap.has(tileKey)) {
        const pe = pickupEffectMap.get(tileKey)
        char = pe?.char ?? '*'
        color = pe?.color ?? '#C8C8FF'
      } else if (reveryCastMap.has(tileKey)) {
        const rc = reveryCastMap.get(tileKey)
        char = rc?.char ?? '^'
        color = rc?.color ?? '#FF4500'
      } else if (crumbleMap.has(tileKey)) {
        const cr = crumbleMap.get(tileKey)
        char = cr?.char ?? '#'
        color = cr?.color ?? '#997755'
      } else if (meteoritePositions.has(tileKey)) {
        char = METEORITE_CHAR
        isEntity = true
        if (pathPositions.has(tileKey)) {
          color = ACTION_COLOR
        } else if (hoverPathPositions.has(tileKey)) {
          color = HOVER_PATH_COLOR
        } else {
          color = METEORITE_COLOR
        }
      } else if (groundItemMap.has(tileKey)) {
        const groundEntry = groundItemMap.get(tileKey)
        isEntity = true
        if (groundEntry) {
          const def = getDefinition(groundEntry.definitionId)
          char = def.glyph
          color =
            groundEntry.definitionId === 'coin' && groundEntry.glinting === false ? COIN_DULL_COLOR : def.glyphColor
        } else {
          const tile = map[my][mx]
          char = TILE_CHARS[tile.type]
          color = TILE_COLORS[tile.type]
        }
      } else if (state.cloverGrowthPreviews.has(tileKey)) {
        const h = tileHash(mx, my)
        const phase = (h >> 8) % CLOVER_PREVIEW_COLORS.length
        const colorIndex = (phase + Math.floor(time * CLOVER_PREVIEW_BLINK_SPEED)) % CLOVER_PREVIEW_COLORS.length
        char = TILE_CHARS[TileType.Clover]
        color = CLOVER_PREVIEW_COLORS[colorIndex]
      } else if (pathPositions.has(tileKey)) {
        const pathTile = map[my][mx]
        if (pathTile.type === TileType.CaveEntrance) {
          char = TILE_CHARS[TileType.CaveEntrance]
          color = ACTION_COLOR
        } else {
          char = waypointPositions.has(tileKey) ? '+' : '\u00b7'
          color = ACTION_COLOR
        }
      } else if (hoverPathPositions.has(tileKey)) {
        const hoverTile = map[my][mx]
        char = TILE_CHARS[hoverTile.type]
        color = HOVER_PATH_COLOR
      } else if (trailMap.has(tileKey)) {
        const tile = map[my][mx]
        char = TILE_CHARS[tile.type]
        const opacity = trailMap.get(tileKey) ?? 0
        const brightness = String(Math.round(opacity * 255))
        color = `rgb(${brightness}, ${brightness}, ${brightness})`
      } else {
        // Mask hidden chamber tiles as CaveWall until revealed
        if (!state.caveRevealed && state.caveHiddenPositions.has(tileKey)) {
          char = TILE_CHARS[TileType.CaveWall]
          color = TILE_COLORS[TileType.CaveWall]
        } else if (state.currentZone === Zone.Overworld && state.rivers.has(tileKey)) {
          // River water (overworld only)
          const h2 = tileHash(mx, my)
          const waterChars = ['~', '=', '-']
          char = waterChars[(h2 + Math.floor(time * 0.004)) % waterChars.length]
          color = RIVER_COLOR
        } else if (state.currentZone === Zone.Overworld && state.ponds.has(tileKey)) {
          // Pond water (overworld only)
          const h2 = tileHash(mx, my)
          const waterChars = ['~', '=']
          char = waterChars[(h2 + Math.floor(time * 0.003)) % waterChars.length]
          color = POND_COLOR
        } else {
          const tile = map[my][mx]
          char = TILE_CHARS[tile.type]
          // Dying clover: override color based on lifecycle stage
          const lifecycle = tile.type === TileType.Clover ? state.cloverLifecycle.get(tileKey) : undefined
          if (lifecycle && lifecycle.stage !== CloverStage.Healthy) {
            switch (lifecycle.stage) {
              case CloverStage.Brown:
                color = CLOVER_BROWN_COLOR
                break
              case CloverStage.BlinkingRed: {
                const h = tileHash(mx, my)
                const phase = (h % 628) / 100
                const t = (Math.sin(time * CLOVER_DYING_OSCILLATION_SPEED + phase) + 1) / 2
                const r = Math.round(
                  CLOVER_DYING_COLOR_FROM[0] + (CLOVER_DYING_COLOR_TO[0] - CLOVER_DYING_COLOR_FROM[0]) * t
                )
                const g = Math.round(
                  CLOVER_DYING_COLOR_FROM[1] + (CLOVER_DYING_COLOR_TO[1] - CLOVER_DYING_COLOR_FROM[1]) * t
                )
                const b = Math.round(
                  CLOVER_DYING_COLOR_FROM[2] + (CLOVER_DYING_COLOR_TO[2] - CLOVER_DYING_COLOR_FROM[2]) * t
                )
                color = `rgb(${String(r)},${String(g)},${String(b)})`
                break
              }
              case CloverStage.Black:
                color = CLOVER_BLACK_COLOR
                break
              case CloverStage.Decomposing:
                color = CLOVER_DECOMPOSE_COLOR
                break
              default:
                color = CLOVER_HEALTHY_COLORS[tileHash(mx, my) % CLOVER_HEALTHY_COLORS.length]
            }
          } else if (tile.type === TileType.Clover) {
            color = CLOVER_HEALTHY_COLORS[tileHash(mx, my) % CLOVER_HEALTHY_COLORS.length]
          } else if (tile.type === TileType.Dirt) {
            if (state.burnScars.has(tileKey)) {
              color = BURN_SCAR_COLORS[tileHash(mx, my) % BURN_SCAR_COLORS.length]
            } else {
              color = DIRT_COLORS[tileHash(mx, my) % DIRT_COLORS.length]
            }
          } else if (tile.type === TileType.Sand) {
            color = SAND_COLORS[tileHash(mx, my) % SAND_COLORS.length]
          } else {
            color = TILE_COLORS[tile.type]
          }
        }
      }

      // Dev paint preview: show target tile type with pink background
      if (devPaintPositions.has(tileKey)) {
        if (devPaintTileType) {
          char = TILE_CHARS[devPaintTileType as keyof typeof TILE_CHARS] ?? '?'
          color = TILE_COLORS[devPaintTileType as keyof typeof TILE_COLORS] ?? '#ffffff'
        }
        ctx.fillStyle = ACTION_COLOR
        ctx.fillRect(px, py, charWidth, charHeight)
        ctx.fillStyle = color
        ctx.fillText(char, px, py)
        continue
      }

      // Dev entity preview: show glyph with pink background at hovered tile
      if (mx === state.devEntityPreview?.x && my === state.devEntityPreview?.y) {
        ctx.fillStyle = ACTION_COLOR
        ctx.fillRect(px, py, charWidth, charHeight)
        ctx.fillStyle = state.devEntityPreview.color
        ctx.fillText(state.devEntityPreview.char, px, py)
        continue
      }

      // Angel group highlight: if cursor or facingEntity is on any tile in this
      // angel's body, highlight ALL body tiles pink
      const angelGroup = angelTileToGroup.get(tileKey)
      const isAngelGroupHighlighted =
        angelGroup !== undefined &&
        !state.devPanelOpen &&
        (Boolean(state.cursorTile && angelGroup.has(posKey(state.cursorTile.x, state.cursorTile.y))) ||
          Boolean(state.facingEntityPos && angelGroup.has(posKey(state.facingEntityPos.x, state.facingEntityPos.y))) ||
          Boolean(
            state.pendingInteractionTarget &&
              angelGroup.has(posKey(state.pendingInteractionTarget.x, state.pendingInteractionTarget.y))
          ))

      // Genesis-to-gameplay crossfade: fade in entities not visible during genesis
      const applyEntityFade = isTransitioning && isEntity
      if (applyEntityFade) ctx.globalAlpha = transitionAlpha

      // Draw with cursor/facing inversion if applicable
      // Invalid preview tiles (e.g. red X for lightning targeting) skip cursor inversion
      if (previewTile && !previewTile.isValid) {
        ctx.fillStyle = color
      } else if (state.devPanelOpen) {
        // Suppress cursor highlight when dev panel is open
        ctx.fillStyle = color
      } else if (isAngelGroupHighlighted) {
        ctx.fillStyle = ACTION_COLOR
        ctx.fillRect(px, py, charWidth, charHeight)
        ctx.fillStyle = BG_COLOR
      } else if ((isCursor && cursorable) || isFacingEntity || isPendingTarget) {
        ctx.fillStyle = ACTION_COLOR
        ctx.fillRect(px, py, charWidth, charHeight)
        ctx.fillStyle = BG_COLOR
      } else {
        ctx.fillStyle = color
      }
      ctx.fillText(char, px, py)

      if (applyEntityFade) ctx.globalAlpha = 1
    }
  }

  // Rain overlay pass — draw animated rain near entities with rain aura (from ECS)
  for (const eid of state.world.query(ComponentType.Aura, ComponentType.Position)) {
    if (!inZone(eid)) continue
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
        const h = tileHash(wx + state.rainSeed, wy)
        if (h % RAIN_AURA_DENSITY !== 0) continue

        // Animate: offset by time so drops appear to fall
        const phase = ((h >> 4) + Math.floor(time * RAIN_AURA_SPEED)) % RAIN_AURA_CHARS.length
        const colorPhase = ((h >> 8) + Math.floor(time * RAIN_AURA_SPEED * 0.7)) % RAIN_AURA_COLORS.length

        const rpx = vx * charWidth
        const rpy = vy * charHeight
        ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
        ctx.fillText(RAIN_AURA_CHARS[phase], rpx, rpy)
      }
    }
  }

  // Revery rain overlay — same visual style as Gron's rain, on cast tiles
  for (const rp of reveryCastRainPositions) {
    const wx = rp.x
    const wy = rp.y
    const vx = wx - camera.x
    const vy = wy - camera.y
    if (vx < 0 || vx >= viewportWidth || vy < 0 || vy >= viewportHeight) continue

    const h = tileHash(wx + state.rainSeed, wy)
    const phase = ((h >> 4) + Math.floor(time * RAIN_AURA_SPEED)) % RAIN_AURA_CHARS.length
    const colorPhase = ((h >> 8) + Math.floor(time * RAIN_AURA_SPEED * 0.7)) % RAIN_AURA_COLORS.length

    const rpx = vx * charWidth
    const rpy = vy * charHeight
    ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
    ctx.fillText(RAIN_AURA_CHARS[phase], rpx, rpy)
  }

  // Weather rain overlay — animated rain follows the sweeping rain front (overworld only)
  // Uses rainIntensity for fade in/out and isInRainFront for blotchy edges
  if (state.rainIntensity > 0 && zone === Zone.Overworld) {
    const savedAlpha = ctx.globalAlpha

    for (let vy = 0; vy < viewportHeight; vy++) {
      for (let vx = 0; vx < viewportWidth; vx++) {
        const wx = camera.x + vx
        const wy = camera.y + vy
        if (!isInBounds(wx, wy, state.mapWidth, state.mapHeight)) continue
        if (wx === player.x && wy === player.y) continue

        // Check if tile is within rain front (blotchy edges via fringe noise)
        const front = isInRainFront(state, wx, wy)
        if (!front.hit) continue

        const h = tileHash(wx + state.rainSeed, wy)
        if (h % WEATHER_RAIN_DENSITY !== 0) continue

        const phase = ((h >> 4) + Math.floor(time * RAIN_AURA_SPEED)) % RAIN_AURA_CHARS.length
        const colorPhase = ((h >> 8) + Math.floor(time * RAIN_AURA_SPEED * 0.7)) % RAIN_AURA_COLORS.length

        // Alpha = rainIntensity (fade in/out) * edgeAlpha (fringe falloff)
        ctx.globalAlpha = state.rainIntensity * front.edgeAlpha

        const rpx = vx * charWidth
        const rpy = vy * charHeight
        ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
        ctx.fillText(RAIN_AURA_CHARS[phase], rpx, rpy)
      }
    }

    ctx.globalAlpha = savedAlpha
  }

  // Glinting zone sparkle overlay — overworld only
  if (zone === Zone.Overworld) {
    for (let vy = 0; vy < viewportHeight; vy++) {
      for (let vx = 0; vx < viewportWidth; vx++) {
        const wx = camera.x + vx
        const wy = camera.y + vy
        if (!isInBounds(wx, wy, state.mapWidth, state.mapHeight)) continue
        const key = posKey(wx, wy)
        if (!state.glintZones.has(key)) continue
        if (wx === player.x && wy === player.y) continue

        const h = tileHash(wx + state.rainSeed, wy)
        const opacity = state.glintOpacity.get(key) ?? 0
        if (opacity <= 0) continue
        const effectiveDensity = Math.ceil(GLINT_ZONE_DENSITY / opacity)
        if (h % effectiveDensity !== 0) continue

        const glintPhase = ((h >> 4) + Math.floor(time * GLINT_ZONE_SPEED)) % GLINT_ZONE_CHARS.length
        const glintColorPhase = ((h >> 8) + Math.floor(time * GLINT_ZONE_SPEED * 0.7)) % GLINT_ZONE_COLORS.length

        const gpx = vx * charWidth
        const gpy = vy * charHeight
        ctx.fillStyle = GLINT_ZONE_COLORS[glintColorPhase]
        ctx.fillText(GLINT_ZONE_CHARS[glintPhase], gpx, gpy)
      }
    }
  }

  // Deep Time burning overlay — fire characters on burning tiles
  if (state.deepTime?.active && state.deepTime.phase === DeepTimePhase.Burning) {
    for (let vy = 0; vy < viewportHeight; vy++) {
      for (let vx = 0; vx < viewportWidth; vx++) {
        const wx = camera.x + vx
        const wy = camera.y + vy
        if (!isInBounds(wx, wy, state.mapWidth, state.mapHeight)) continue
        if (map[wy][wx].type !== TileType.BurntClover) continue

        const h = tileHash(wx, wy)
        if (h % 3 !== 0) continue // sparse

        const fireChars = ['^', '~', '*']
        const fireColors = ['#FF4500', '#FF6600', '#FF8800', '#FFAA00']
        const phase = ((h >> 4) + Math.floor(time * 0.01)) % fireChars.length
        const colorPhase = ((h >> 8) + Math.floor(time * 0.008)) % fireColors.length

        const rpx = vx * charWidth
        const rpy = vy * charHeight
        ctx.fillStyle = fireColors[colorPhase]
        ctx.fillText(fireChars[phase], rpx, rpy)
      }
    }
  }

  // Deep Time year counter moved to Sidebar.tsx

  // Lightning screen flash overlay — drawn last, covers everything
  if (lightningFlashElapsed < LIGHTNING_SCREEN_FLASH_MS) {
    const alpha = LIGHTNING_SCREEN_FLASH_OPACITY * (1 - lightningFlashElapsed / LIGHTNING_SCREEN_FLASH_MS)
    ctx.fillStyle = `rgba(255, 255, 255, ${String(alpha)})`
    ctx.fillRect(0, 0, pxWidth, pxHeight)
  }

  // Angel spawn/despawn screen flash overlay
  const angelFlashElapsed = time - state.angelFlashTime
  if (angelFlashElapsed < LIGHTNING_SCREEN_FLASH_MS) {
    const alpha = LIGHTNING_SCREEN_FLASH_OPACITY * (1 - angelFlashElapsed / LIGHTNING_SCREEN_FLASH_MS)
    ctx.fillStyle = `rgba(255, 255, 255, ${String(alpha)})`
    ctx.fillRect(0, 0, pxWidth, pxHeight)
  }
}
