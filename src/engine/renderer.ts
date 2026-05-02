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
  DEEP_TIME_SHAKE_AMPLITUDE,
  DEEP_TIME_TRANSITION_GLYPH_DURATION_MS,
  BUILDING_CHARS,
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
  FOG_EXPLORED_BRIGHTNESS,
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
  GLINT_BEAM_CHAR,
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
  MONARCH_CHAR,
  MONARCH_COLOR,
  PICKUP_EFFECT_BLOOM_MS,
  PICKUP_EFFECT_CHARS_FILL,
  PICKUP_EFFECT_CHARS_RING,
  PICKUP_EFFECT_COLORS,
  PICKUP_EFFECT_DURATION_MS,
  PICKUP_EFFECT_RADIUS,
  PLAYER_CHAR,
  PLAYER_COLOR,
  POND_COLOR,
  PRAIRIE_HALO_COLOR,
  PRAIRIE_HALO_MAX_ALPHA,
  PRAIRIE_HALO_PULSE_SPEED,
  PRAIRIE_HALO_RADIUS,
  PRAIRIE_OUTLINE_ALPHA,
  PRAIRIE_OUTLINE_COLOR,
  PRAIRIE_OUTLINE_WIDTH,
  RAIN_AURA_CHARS,
  RAIN_AURA_COLORS,
  RAIN_AURA_DENSITY,
  RAIN_AURA_SPEED,
  RIVER_COLOR,
  RUIN_ENTRANCE_HALO_COLOR,
  SAND_COLORS,
  SATELLITE_HEAD_COLORS,
  SATELLITE_SHAKE_AMPLITUDE,
  SATELLITE_IMPACT_DURATION_MS,
  SATELLITE_IMPACT_RADIUS_VISUAL,
  SATELLITE_TRAIL_COLORS,
  SHOOTING_STAR_HEAD_CHAR,
  SHOOTING_STAR_HEAD_COLOR,
  SHOOTING_STAR_TRAIL_CHARS,
  SHOOTING_STAR_TRAIL_CHARS_ISO,
  SHOOTING_STAR_TRAIL_COLORS,
  SOIL_HEALTH_DEFAULT,
  TILE_CHARS,
  TILE_COLORS,
  getEntranceGlyph,
  TRAIL_DURATION_MS,
  EDGE_SCROLL_INDICATOR_THICKNESS_PX,
  MOVE_ORDER_MARKER_DURATION_MS,
  WEATHER_RAIN_DENSITY,
  WILDFIRE_CHARS,
  WILDFIRE_COLORS,
  WILDFIRE_DURATION_MS,
} from './constants'
import { ComponentType } from './ecs/types'
import { GENESIS_EPOCHS } from './genesis'
import { renderGenesis } from './genesisRenderer'
import { getDefinition } from './items'
import {
  computeBeamSegmentOpacity,
  tileBeamLength,
  tileBeamMaxOpacity,
  tileHasBeam,
} from './glintZones'
import { getTweenLerp } from './movementTween'
import { isInBounds, posKey, tileHash } from './position'
import {
  drawCellBackground,
  drawCellHighlight,
  drawCellWalls,
  getCellDiamondCorners,
  getElevationLift,
  viewportToScreen,
  worldToScreen,
} from './projection'
import { getReveryDefinition } from './reveries'
import { getEntranceHaloCells, getRuinTileLayers, shouldRenderRuinMultilayer } from './ruins'
import { getSelectedUnitPositions } from './selection'
import { isInRainFront } from './tileWater'
import { computeZoneVisibility, dimColor, getTileVisibility, hasFogOfWar, tickIllumination } from './visibility'
import { getVisibleTileBounds, isTileInVisibleViewport } from './viewportBounds'
import { CloverStage, DeepTimePhase, TileType, Zone } from './types'
import { isEntityInCurrentZone } from './zone'
import { PLAYER_COLORS } from '@revery-prairie/shared'

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

// Cached offscreen canvas for the prairie halo pass. The halo is drawn here
// without blur, then composited to the main canvas with a single blur filter
// pass — orders of magnitude cheaper than applying ctx.filter per fillRect.
let _haloOffscreen: HTMLCanvasElement | null = null
const getHaloOffscreen = (width: number, height: number): HTMLCanvasElement => {
  _haloOffscreen ??= document.createElement('canvas')
  if (_haloOffscreen.width !== width) _haloOffscreen.width = width
  if (_haloOffscreen.height !== height) _haloOffscreen.height = height
  return _haloOffscreen
}

export { type CharMetrics } from './types'

// Prairie halo helpers (exported for tests).
// nearestLandDistance returns the chebyshev distance from (x, y) to the
// nearest non-Space, in-bounds tile, capped at maxRadius. Returns Infinity
// if no land is found within the radius. (x, y) itself is treated as space
// when the caller has already determined it is — callers pass space cells
// only.
export const nearestLandDistance = (
  map: { type: TileType }[][],
  mapWidth: number,
  mapHeight: number,
  x: number,
  y: number,
  maxRadius: number,
): number => {
  for (let r = 1; r <= maxRadius; r++) {
    const x0 = x - r
    const x1 = x + r
    const y0 = y - r
    const y1 = y + r
    for (let ny = y0; ny <= y1; ny++) {
      if (ny < 0 || ny >= mapHeight) continue
      for (let nx = x0; nx <= x1; nx++) {
        if (nx < 0 || nx >= mapWidth) continue
        // Only inspect the ring at chebyshev distance r
        if (Math.max(Math.abs(nx - x), Math.abs(ny - y)) !== r) continue
        if (map[ny][nx].type !== TileType.Space) return r
      }
    }
  }
  return Infinity
}

// computePrairieHaloAlpha maps (distance to nearest land, time) to a halo
// alpha in [0, PRAIRIE_HALO_MAX_ALPHA]. Returns 0 when distance is beyond
// PRAIRIE_HALO_RADIUS or non-finite. Alpha is the product of a radial
// falloff (1 at distance 1, 0 at the radius) and a global breathing pulse.
// The result fades all the way to 0 at the radius — no min-alpha floor —
// so the soft glow disappears smoothly into space. Pure function; no DOM.
export const computePrairieHaloAlpha = (distance: number, time: number): number => {
  if (!Number.isFinite(distance)) return 0
  if (distance < 1 || distance > PRAIRIE_HALO_RADIUS) return 0
  const falloff = 1 - (distance - 1) / PRAIRIE_HALO_RADIUS
  const pulse = Math.sin(time * PRAIRIE_HALO_PULSE_SPEED) * 0.5 + 0.5
  const raw = PRAIRIE_HALO_MAX_ALPHA * falloff * pulse
  return Math.max(0, Math.min(PRAIRIE_HALO_MAX_ALPHA, raw))
}

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

// Cave fog of war: last computed visible set, readable by sidebar
let _lastVisibleSet: Set<string> | null = null
export const getLastVisibleSet = (): Set<string> | null => _lastVisibleSet
/** @deprecated Use getLastVisibleSet instead. */
export const getLastCaveVisibleSet = getLastVisibleSet

// ── Pooled render collections ──
// Reused every frame to avoid per-frame allocation / GC pressure.
const _beePositions = new Set<string>()
const _monarchPositions = new Set<string>()
const _groundItemMap = new Map<string, { definitionId: string; glinting?: boolean }>()
const _previewMap = new Map<string, { char: string; color: string; isValid: boolean }>()
const _pathPositions = new Set<string>()
const _waypointPositions = new Set<string>()
const _hoverPathPositions = new Set<string>()
const _devPaintPositions = new Set<string>()
const _satelliteMap = new Map<string, { char: string; color: string }>()
const _satelliteImpactMap = new Map<string, { char: string; color: string }>()
const _shootingStarMap = new Map<string, { char: string; color: string }>()
const _targetedStarMap = new Map<string, { char: string; color: string }>()
const _meteoritePositions = new Set<string>()
const _beehivePositions = new Set<string>()
const _characterMap = new Map<string, { glyph: string; color: string; id: string }>()
const _remotePlayerMap = new Map<string, { color: string; sessionId: string }>()
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
const _entranceGlyphMap = new Map<string, string>()

export const render = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  // Genesis mode — delegate to genesis renderer
  if (state.genesis && state.genesis.epochIndex < GENESIS_EPOCHS.length) {
    renderGenesis(ctx, state.genesis, GENESIS_EPOCHS, metrics, state.viewportWidth, state.viewportHeight, time)
    return
  }

  const { camera, viewportWidth, viewportHeight, map, player } = state
  const { charWidth, charHeight } = metrics
  const iso = state.isometricProjection

  // Cosmetic terrain elevation lift: per-tile y-offset based on
  // state.elevation. Returns 0 for cave/space/out-of-bounds (no entry
  // in the map). Defined here so every per-tile draw call can opt in
  // with `+ liftAt(mx, my)` without re-deriving charHeight or posKey.
  const liftAt = (mx: number, my: number): number =>
    getElevationLift(state.elevation.get(posKey(mx, my)), charHeight)

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

  // Camera shake — translate entire canvas during impacts or deep time
  const deepTimeShake = state.deepTime?.active === true && time < state.deepTime.shakeUntil
  const satelliteShake = time < state.screenShakeUntil
  const shakeActive = deepTimeShake || satelliteShake

  // Edge-scroll camera drift: integer camera coords are needed for tile
  // indexing (map[my][mx] etc.), but stepping the camera one full tile per
  // ~3-4 frames of edge-scroll produces visible jumps. Render the scene
  // with a sub-tile pixel translate so motion looks continuous; the
  // remainder is held in cameraSubpixel until it crosses an integer tile.
  let driftPx = 0
  let driftPy = 0
  if (state.cameraMode === 'free') {
    if (iso) {
      driftPx = (state.cameraSubpixel.x - state.cameraSubpixel.y) * charWidth
      driftPy = (state.cameraSubpixel.x + state.cameraSubpixel.y) * (charHeight / 2)
    } else {
      driftPx = state.cameraSubpixel.x * charWidth
      driftPy = state.cameraSubpixel.y * charHeight
    }
  }

  const worldTransformActive = shakeActive || driftPx !== 0 || driftPy !== 0
  if (worldTransformActive) {
    let sx = 0
    let sy = 0
    if (shakeActive) {
      const amplitude = satelliteShake ? SATELLITE_SHAKE_AMPLITUDE : DEEP_TIME_SHAKE_AMPLITUDE
      sx = (Math.random() * 2 - 1) * amplitude
      sy = (Math.random() * 2 - 1) * amplitude
    }
    ctx.save()
    // Translating by -drift makes the rendered scene shift the same way
    // it would if camera had advanced fractionally, completing the visual
    // illusion of continuous motion without breaking integer tile indexing.
    ctx.translate(sx - driftPx, sy - driftPy)
  }

  // Player tween: glyph draws at the projected fractional world position.
  // Selection/cursor highlights stay anchored to the integer player tile.
  // Routing through worldToScreen makes the projection match the renderer
  // (orthogonal or isometric) — same path the coyote/ECS lerp post-pass uses.
  let playerLerpX = player.x
  let playerLerpY = player.y
  if (state.playerTween) {
    const lerp = getTweenLerp(state.playerTween, time, player.x, player.y)
    if (lerp.t >= 1) {
      state.playerTween = null
    } else {
      playerLerpX = lerp.x
      playerLerpY = lerp.y
    }
  }
  const playerScreen = worldToScreen(
    playerLerpX,
    playerLerpY,
    camera,
    charWidth,
    charHeight,
    iso,
    viewportWidth,
    viewportHeight,
  )
  const playerLift = liftAt(player.x, player.y)

  // Zone filter helper — only render entities in the current zone (including ruinIndex match)
  const zone = state.currentZone
  const inZone = (eid: number): boolean => isEntityInCurrentZone(state, eid)

  // Clear pooled collections for this frame
  _beePositions.clear()
  _monarchPositions.clear()
  _groundItemMap.clear()
  _previewMap.clear()
  _pathPositions.clear()
  _waypointPositions.clear()
  _hoverPathPositions.clear()
  _devPaintPositions.clear()
  _satelliteMap.clear()
  _satelliteImpactMap.clear()
  _shootingStarMap.clear()
  _targetedStarMap.clear()
  _meteoritePositions.clear()
  _beehivePositions.clear()
  _characterMap.clear()
  _remotePlayerMap.clear()
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
  const monarchPositions = _monarchPositions
  const groundItemMap = _groundItemMap
  const previewMap = _previewMap
  const pathPositions = _pathPositions
  const waypointPositions = _waypointPositions
  const hoverPathPositions = _hoverPathPositions
  const devPaintPositions = _devPaintPositions
  const satelliteMap = _satelliteMap
  const satelliteImpactMap = _satelliteImpactMap
  const shootingStarMap = _shootingStarMap
  const targetedStarMap = _targetedStarMap
  const meteoritePositions = _meteoritePositions
  const beehivePositions = _beehivePositions
  const characterMap = _characterMap
  const remotePlayerMap = _remotePlayerMap
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

  // Build selected unit position set for highlight rendering
  const selectedPositions = getSelectedUnitPositions(state)

  // Build overworld entrance glyph map (posKey → Greek letter)
  _entranceGlyphMap.clear()
  if (state.currentZone === Zone.Overworld) {
    _entranceGlyphMap.set(posKey(state.caveEntranceOverworld.x, state.caveEntranceOverworld.y), getEntranceGlyph(0))
    for (const interior of state.ruinInteriors) {
      const { x, y } = interior.entranceOverworld
      _entranceGlyphMap.set(posKey(x, y), interior.glyph ?? getEntranceGlyph(interior.ruinIndex + 1))
    }
  }
  const entranceGlyphMap = _entranceGlyphMap

  // ECS movement tweens — collect entities currently interpolating between tiles.
  // Suppressed entities skip the integer-tile maps and are drawn at fractional
  // pixel positions in a post-pass. Completed tweens are removed lazily.
  interface TweenedEntity {
    eid: number
    char: string
    color: string
    lerpX: number
    lerpY: number
  }
  const tweenedEntities: TweenedEntity[] = []
  const suppressedEntities = new Set<number>()
  for (const eid of state.world.query(ComponentType.MovementTween, ComponentType.Position)) {
    if (!inZone(eid)) continue
    const tween = state.world.getComponent(eid, ComponentType.MovementTween)
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!tween || !pos) continue
    const lerp = getTweenLerp(tween, time, pos.x, pos.y)
    if (lerp.t >= 1) {
      state.world.removeComponent(eid, ComponentType.MovementTween)
      continue
    }
    let char: string | null = null
    let color: string | null = null
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (identity) {
      const def = getCharacterDefinition(identity.definitionId)
      char = def.glyph
      color = def.glyphColor
    } else {
      const tag = state.world.getComponent(eid, ComponentType.EntityTag)
      if (tag === 'bee') {
        char = BEE_CHAR
        color = BEE_COLOR
      } else if (tag === 'monarch') {
        char = MONARCH_CHAR
        color = MONARCH_COLOR
      }
    }
    if (char === null || color === null) continue
    tweenedEntities.push({ eid, char, color, lerpX: lerp.x, lerpY: lerp.y })
    suppressedEntities.add(eid)
  }

  // Populate bee positions (from ECS)
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'bee') continue
    if (!inZone(eid)) continue
    if (suppressedEntities.has(eid)) continue
    const bpos = state.world.getComponent(eid, ComponentType.Position)
    if (bpos) beePositions.add(posKey(bpos.x, bpos.y))
  }

  // Populate monarch positions (from ECS)
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'monarch') continue
    if (!inZone(eid)) continue
    if (suppressedEntities.has(eid)) continue
    const mpos = state.world.getComponent(eid, ComponentType.Position)
    if (mpos) monarchPositions.add(posKey(mpos.x, mpos.y))
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
    // Trail — step backward along negated velocity. iso projection rotates
    // world deltas by 45° on screen, so pick a table whose glyphs match the
    // projected direction rather than the world-space direction.
    const velKey = posKey(vel.dx, vel.dy) as VelocityKey
    const trailTable = state.isometricProjection ? SHOOTING_STAR_TRAIL_CHARS_ISO : SHOOTING_STAR_TRAIL_CHARS
    const trailChar = trailTable[velKey] ?? '-'
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

  // Populate satellite pixel maps — render over both space and land
  for (const eid of state.world.query(ComponentType.SatelliteData, ComponentType.Position, ComponentType.Velocity)) {
    if (!inZone(eid)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const vel = state.world.getComponent(eid, ComponentType.Velocity)
    const data = state.world.getComponent(eid, ComponentType.SatelliteData)
    if (!pos || !vel || !data) continue
    // Head — cycle through BUILDING_CHARS with red palette
    const headHash = tileHash(pos.x, pos.y)
    const headChar = BUILDING_CHARS[headHash % BUILDING_CHARS.length]
    const headColor = SATELLITE_HEAD_COLORS[headHash % SATELLITE_HEAD_COLORS.length]
    satelliteMap.set(posKey(pos.x, pos.y), { char: headChar, color: headColor })
    // Trail — BUILDING_CHARS with fading red
    for (let t = 1; t <= data.length; t++) {
      const tx = pos.x - vel.dx * t
      const ty = pos.y - vel.dy * t
      const th = tileHash(tx, ty)
      const trailChar = BUILDING_CHARS[th % BUILDING_CHARS.length]
      const colorIndex = Math.min(t - 1, SATELLITE_TRAIL_COLORS.length - 1)
      satelliteMap.set(posKey(tx, ty), { char: trailChar, color: SATELLITE_TRAIL_COLORS[colorIndex] })
    }
  }

  // Populate satellite impact effect pixels (from ECS)
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (!inZone(eid)) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'satelliteImpact') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!pos || !effect) continue

    const elapsed = time - effect.startTime
    const progress = Math.min(elapsed / SATELLITE_IMPACT_DURATION_MS, 1)
    const currentRadius = Math.floor(progress * SATELLITE_IMPACT_RADIUS_VISUAL)
    const impactChars = BUILDING_CHARS
    const impactColors = SATELLITE_HEAD_COLORS

    if (currentRadius === 0) {
      const ch = impactChars[tileHash(pos.x, pos.y) % impactChars.length]
      satelliteImpactMap.set(posKey(pos.x, pos.y), { char: ch, color: impactColors[0] })
    } else {
      for (let dy = -currentRadius; dy <= currentRadius; dy++) {
        for (let dx = -currentRadius; dx <= currentRadius; dx++) {
          if (Math.abs(dx) !== currentRadius && Math.abs(dy) !== currentRadius) continue
          const ex = pos.x + dx
          const ey = pos.y + dy
          if (isInBounds(ex, ey, state.mapWidth, state.mapHeight)) {
            const h = tileHash(ex, ey)
            const charIdx = (h + Math.floor(progress * impactChars.length)) % impactChars.length
            const colorIdx = Math.min(Math.floor(progress * impactColors.length), impactColors.length - 1)
            satelliteImpactMap.set(posKey(ex, ey), { char: impactChars[charIdx], color: impactColors[colorIdx] })
          }
        }
      }
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

  // Populate remote player positions (multiplayer). Overworld only in MVP.
  if (state.currentZone === Zone.Overworld) {
    for (const remote of state.remotePlayers.values()) {
      const hex = PLAYER_COLORS[remote.color].hex
      remotePlayerMap.set(posKey(remote.x, remote.y), { color: hex, sessionId: remote.sessionId })
    }
  }

  // Populate character positions (from ECS)
  for (const eid of state.world.query(ComponentType.CharacterIdentity, ComponentType.Position)) {
    if (!inZone(eid)) continue
    if (suppressedEntities.has(eid)) continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (!pos || !identity) continue
    const key = posKey(pos.x, pos.y)
    // Hide characters in masked hidden chamber until wall is broken
    if (!state.caveRevealed && state.caveHiddenPositions.has(key)) continue
    const def = getCharacterDefinition(identity.definitionId)
    characterMap.set(key, { glyph: def.glyph, color: def.glyphColor, id: identity.definitionId })
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

    const earthScanBounds = getVisibleTileBounds(iso, viewportWidth, viewportHeight)
    for (let vy = earthScanBounds.vyStart; vy < earthScanBounds.vyEnd; vy++) {
      for (let vx = earthScanBounds.vxStart; vx < earthScanBounds.vxEnd; vx++) {
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
    const drawBounds = getVisibleTileBounds(iso, viewportWidth, viewportHeight)
    for (let vy = drawBounds.vyStart; vy < drawBounds.vyEnd; vy++) {
      for (let vx = drawBounds.vxStart; vx < drawBounds.vxEnd; vx++) {
        const key = posKey(camera.x + vx, camera.y + vy)
        const scanBg = earthScanBgMap.get(key)
        if (scanBg) {
          if (scanBg.opacity >= 1) {
            ctx.fillStyle = scanBg.color
          } else {
            ctx.fillStyle = lerpColor(scanBg.color, BG_COLOR, 1 - scanBg.opacity)
          }
          const { px: bgPx, py: bgPy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
          drawCellBackground(ctx, bgPx, bgPy + liftAt(camera.x + vx, camera.y + vy), charWidth, charHeight, iso)
        }
      }
    }
  }

  // Pre-pass: ruin entrance halo (overworld only). Paints a 3x3 dark backdrop
  // around each visible RuinEntrance so it reads as a doorway-in-shadow.
  if (state.currentZone === Zone.Overworld && state.ruinInteriors.length > 0) {
    ctx.fillStyle = RUIN_ENTRANCE_HALO_COLOR
    for (const interior of state.ruinInteriors) {
      const cells = getEntranceHaloCells(
        map,
        state.mapWidth,
        state.mapHeight,
        interior.entranceOverworld.x,
        interior.entranceOverworld.y,
      )
      for (const cell of cells) {
        const vx = cell.x - camera.x
        const vy = cell.y - camera.y
        if (vx < 0 || vx >= viewportWidth || vy < 0 || vy >= viewportHeight) continue
        const { px: hPx, py: hPy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
        drawCellBackground(ctx, hPx, hPy + liftAt(cell.x, cell.y), charWidth, charHeight, iso)
      }
    }
  }

  // Pre-pass: lightning targeting range highlight
  if (state.targetingSlot !== null) {
    const lightningBounds = getVisibleTileBounds(iso, viewportWidth, viewportHeight)
    for (let vy = lightningBounds.vyStart; vy < lightningBounds.vyEnd; vy++) {
      for (let vx = lightningBounds.vxStart; vx < lightningBounds.vxEnd; vx++) {
        const mx = camera.x + vx
        const my = camera.y + vy
        if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
        if (map[my][mx].type === TileType.Space) continue
        const dist = Math.abs(mx - player.x) + Math.abs(my - player.y)
        if (dist > LIGHTNING_REVERY_RANGE) continue
        ctx.fillStyle = LIGHTNING_RANGE_HIGHLIGHT_COLOR
        const { px: lPx, py: lPy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
        drawCellBackground(ctx, lPx, lPy + liftAt(mx, my), charWidth, charHeight, iso)
      }
    }
  }

  // Pre-pass: angel gold aura background
  if (angelAuraCenters.length > 0) {
    const savedAlpha = ctx.globalAlpha
    const angelBounds = getVisibleTileBounds(iso, viewportWidth, viewportHeight)
    for (let vy = angelBounds.vyStart; vy < angelBounds.vyEnd; vy++) {
      for (let vx = angelBounds.vxStart; vx < angelBounds.vxEnd; vx++) {
        const mx = camera.x + vx
        const my = camera.y + vy
        if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
        if (map[my][mx].type === TileType.Space) continue

        for (const ac of angelAuraCenters) {
          const dx = mx - ac.x
          const dy = my - ac.y
          // Distance is measured so the aura reads as a *circle on screen*.
          // In iso, raw tile-space Euclidean distance projects to a 2:1
          // screen-space ellipse (stretched horizontally), which makes the
          // aura look "off". Convert (dx, dy) into screen-space delta and
          // normalize back into tile-width units.
          let distInTiles: number
          if (iso) {
            const sdx = (dx - dy) * charWidth
            const sdy = (dx + dy) * (charHeight / 2)
            distInTiles = Math.sqrt(sdx * sdx + sdy * sdy) / charWidth
          } else {
            distInTiles = Math.sqrt(dx * dx + dy * dy)
          }
          if (distInTiles > ANGEL_AURA_RADIUS) continue

          // Oscillating alpha: gentle sine wave based on time + distance from center
          const wave = Math.sin(time * 0.002 + distInTiles * 0.3) * 0.5 + 0.5 // 0..1
          const falloff = 1 - distInTiles / ANGEL_AURA_RADIUS // 1 at center, 0 at edge
          const alpha = 0.06 + 0.06 * wave * falloff // gentle 0.06..0.12

          ctx.globalAlpha = alpha
          ctx.fillStyle = '#FFD700'
          const { px: aPx, py: aPy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
          drawCellBackground(ctx, aPx, aPy + liftAt(mx, my), charWidth, charHeight, iso)
          break // only one angel aura can contribute per tile
        }
      }
    }
    ctx.globalAlpha = savedAlpha
  }

  // Pre-pass: prairie halo over space tiles adjacent to land. Overworld only,
  // skipped during deep time Burning/Simulating (crimson void already covers
  // space). Iterates the viewport plus a PRAIRIE_HALO_RADIUS margin so the
  // halo extends naturally past the visible edge without the glow "popping
  // in" as the camera approaches a boundary, but without paying the cost of
  // iterating the full ~21k-tile map every frame.
  //
  // The halo is rendered to an offscreen canvas without blur, then composited
  // to the main canvas with a single blur filter pass. Applying ctx.filter
  // per fillRect would re-run blur compositing for every tile (very slow);
  // a single drawImage with blur runs once.
  {
    const deepTimeLocked =
      state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering
    if (state.currentZone === Zone.Overworld && !deepTimeLocked) {
      const halo = getHaloOffscreen(ctx.canvas.width, ctx.canvas.height)
      const hctx = halo.getContext('2d')
      if (hctx) {
        hctx.clearRect(0, 0, halo.width, halo.height)
        hctx.fillStyle = PRAIRIE_HALO_COLOR
        const haloBounds = getVisibleTileBounds(iso, viewportWidth, viewportHeight, PRAIRIE_HALO_RADIUS)
        for (let vy = haloBounds.vyStart; vy < haloBounds.vyEnd; vy++) {
          for (let vx = haloBounds.vxStart; vx < haloBounds.vxEnd; vx++) {
            const mx = camera.x + vx
            const my = camera.y + vy
            if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
            if (map[my][mx].type !== TileType.Space) continue
            const dist = nearestLandDistance(
              map,
              state.mapWidth,
              state.mapHeight,
              mx,
              my,
              PRAIRIE_HALO_RADIUS,
            )
            const alpha = computePrairieHaloAlpha(dist, time)
            if (alpha <= 0) continue
            hctx.globalAlpha = alpha
            const { px: hx, py: hy } = viewportToScreen(
              vx,
              vy,
              charWidth,
              charHeight,
              iso,
              viewportWidth,
              viewportHeight,
            )
            drawCellBackground(hctx, hx, hy, charWidth, charHeight, iso)
          }
        }
        hctx.globalAlpha = 1

        const blurPx = Math.max(charWidth, charHeight) * 1.5
        const savedFilter = ctx.filter
        ctx.filter = `blur(${String(blurPx)}px)`
        ctx.drawImage(halo, 0, 0)
        ctx.filter = savedFilter
      }
    }
  }

  // Pre-pass: 1px crisp outline at the land/space border. Iterates the
  // viewport plus a 1-tile margin so the outline aligns with the halo and
  // remains continuous as the camera moves. The glow itself comes from the
  // halo above, which only fills space tiles — so the gold tint is
  // exclusively outside the prairie. The stroke sits on the boundary line.
  {
    const deepTimeLocked =
      state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering
    if (state.currentZone === Zone.Overworld && !deepTimeLocked) {
      const savedAlpha = ctx.globalAlpha
      const savedStroke = ctx.strokeStyle
      const savedLineWidth = ctx.lineWidth
      ctx.strokeStyle = PRAIRIE_OUTLINE_COLOR
      ctx.globalAlpha = PRAIRIE_OUTLINE_ALPHA
      ctx.lineWidth = PRAIRIE_OUTLINE_WIDTH
      const isSpaceOrOOB = (nx: number, ny: number): boolean => {
        if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) return true
        return map[ny][nx].type === TileType.Space
      }
      ctx.beginPath()
      const outlineMargin = 1
      for (let vy = -outlineMargin; vy < viewportHeight + outlineMargin; vy++) {
        for (let vx = -outlineMargin; vx < viewportWidth + outlineMargin; vx++) {
          const mx = camera.x + vx
          const my = camera.y + vy
          if (!isInBounds(mx, my, state.mapWidth, state.mapHeight)) continue
          if (map[my][mx].type === TileType.Space) continue
          if (iso) {
            const { px, py } = viewportToScreen(
              vx,
              vy,
              charWidth,
              charHeight,
              iso,
              viewportWidth,
              viewportHeight,
            )
            const { leftX, rightX, topY, bottomY, cx, cy } = getCellDiamondCorners(
              px,
              py,
              charWidth,
              charHeight,
            )
            // World cardinals map to diamond edges by on-screen direction:
            //   N (mx, my-1)  → up-right    → top-right edge
            //   E (mx+1, my)  → down-right  → bottom-right edge
            //   S (mx, my+1)  → down-left   → bottom-left edge
            //   W (mx-1, my)  → up-left     → top-left edge
            if (isSpaceOrOOB(mx, my - 1)) {
              ctx.moveTo(cx, topY)
              ctx.lineTo(rightX, cy)
            }
            if (isSpaceOrOOB(mx + 1, my)) {
              ctx.moveTo(rightX, cy)
              ctx.lineTo(cx, bottomY)
            }
            if (isSpaceOrOOB(mx, my + 1)) {
              ctx.moveTo(cx, bottomY)
              ctx.lineTo(leftX, cy)
            }
            if (isSpaceOrOOB(mx - 1, my)) {
              ctx.moveTo(leftX, cy)
              ctx.lineTo(cx, topY)
            }
          } else {
            const px = (mx - camera.x) * charWidth
            const py = (my - camera.y) * charHeight
            if (isSpaceOrOOB(mx, my - 1)) {
              ctx.moveTo(px, py + 0.5)
              ctx.lineTo(px + charWidth, py + 0.5)
            }
            if (isSpaceOrOOB(mx, my + 1)) {
              ctx.moveTo(px, py + charHeight - 0.5)
              ctx.lineTo(px + charWidth, py + charHeight - 0.5)
            }
            if (isSpaceOrOOB(mx - 1, my)) {
              ctx.moveTo(px + 0.5, py)
              ctx.lineTo(px + 0.5, py + charHeight)
            }
            if (isSpaceOrOOB(mx + 1, my)) {
              ctx.moveTo(px + charWidth - 0.5, py)
              ctx.lineTo(px + charWidth - 0.5, py + charHeight)
            }
          }
        }
      }
      ctx.stroke()
      ctx.globalAlpha = savedAlpha
      ctx.strokeStyle = savedStroke
      ctx.lineWidth = savedLineWidth
    }
  }

  // Fog of war: compute visibility, tick illumination expiry
  const fogActive = hasFogOfWar(state.currentZone)
  if (fogActive) tickIllumination(state, time)
  const visibleSet = fogActive ? computeZoneVisibility(state) : null
  _lastVisibleSet = visibleSet

  // In iso mode, the visible footprint is a rotated rectangle. Expand the
  // tile-loop bounds so corner diamonds aren't clipped. Off-canvas writes
  // are cheap because the canvas clips them anyway.
  const tileLoopStart = iso ? -viewportHeight : 0
  const tileLoopEndX = iso ? viewportWidth + viewportHeight : viewportWidth
  const tileLoopEndY = iso ? viewportHeight + viewportWidth : viewportHeight
  for (let vy = tileLoopStart; vy < tileLoopEndY; vy++) {
    for (let vx = tileLoopStart; vx < tileLoopEndX; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy

      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)

      // Out-of-bounds and Space tiles render as twinkling stars (overworld) or dark void (cave)
      const isOutOfBounds = !isInBounds(mx, my, state.mapWidth, state.mapHeight)
      if (isOutOfBounds || map[my][mx].type === TileType.Space) {
        if (state.currentZone === Zone.Cave) {
          // Cave: just leave the dark background
          continue
        }
        if (state.currentZone === Zone.Ruin && isOutOfBounds) {
          // Ruin out-of-bounds: dark background. In-bounds Space tiles fall through to star rendering.
          continue
        }

        // Deep time: space turns crimson during Burning and Simulating
        const deepTimeLocked =
          state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering
        if (deepTimeLocked) {
          const h = tileHash(mx, my)
          const pulse = Math.sin(time * 0.003 + (h & 0xff) * 0.05) * 0.5 + 0.5
          const bgAlpha = 0.15 + 0.1 * pulse
          ctx.fillStyle = `rgba(139, 0, 0, ${String(bgAlpha)})`
          drawCellBackground(ctx, px, py, charWidth, charHeight, iso)
          if (h % STAR_DENSITY === 0) {
            const redColors = ['#550000', '#770000', '#990000', '#771111', '#993333']
            const charPhase = ((h >> 4) + Math.floor(time * 0.002)) % STAR_CHARS.length
            ctx.fillStyle = redColors[(h >> 8) % redColors.length]
            ctx.fillText(STAR_CHARS[charPhase], px, py)
          }
          continue
        }

        const spaceKey = posKey(mx, my)
        const satellite = satelliteMap.get(spaceKey)
        if (satellite) {
          ctx.fillStyle = satellite.color
          ctx.fillText(satellite.char, px, py)
        } else if (satelliteImpactMap.has(spaceKey)) {
          const si = satelliteImpactMap.get(spaceKey)
          ctx.fillStyle = si?.color ?? '#FF4444'
          ctx.fillText(si?.char ?? '░', px, py)
        }
        const shootingStar = shootingStarMap.get(spaceKey) ?? targetedStarMap.get(spaceKey)
        if (!satellite && !satelliteImpactMap.has(spaceKey) && shootingStar) {
          ctx.fillStyle = shootingStar.color
          ctx.fillText(shootingStar.char, px, py)
        } else if (!satellite && !satelliteImpactMap.has(spaceKey)) {
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
      const lift = getElevationLift(state.elevation.get(tileKey), charHeight)
      const pyLift = py + lift

      // Fog of war: skip unexplored tiles, dim partiallyDiscovered tiles.
      // fullyDiscovered tiles fall through to the full render path so live
      // entities show even when out of LOS.
      const tileVis = fogActive ? getTileVisibility(state, mx, my, visibleSet ?? new Set()) : 'visible' as const
      if (tileVis === 'unexplored') {
        // Unexplored — leave as dark background
        continue
      }
      const tileIsPartiallyDiscovered = tileVis === 'partiallyDiscovered'

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

      // partiallyDiscovered tiles: render terrain only at dimmed brightness.
      // fullyDiscovered tiles fall through and are rendered like visible.
      if (tileIsPartiallyDiscovered) {
        const tile = map[my][mx]
        // Mask hidden chamber tiles as CaveWall until revealed (cave only)
        const effectiveType =
          state.currentZone === Zone.Cave && !state.caveRevealed && state.caveHiddenPositions.has(tileKey)
            ? TileType.CaveWall
            : tile.type
        const baseColor = TILE_COLORS[effectiveType]
        const baseChar = TILE_CHARS[effectiveType]
        ctx.fillStyle = dimColor(baseColor, FOG_EXPLORED_BRIGHTNESS)
        ctx.fillText(baseChar, px, pyLift)
        continue
      }

      // Cosmetic elevation: draw the side walls of the lifted tile in
      // its surface color, before any cursor highlight or surface paint.
      // No-op when lift >= 0 (flat / sunken — neighbors handle depressions).
      if (lift < 0) {
        const baseTile = map[my][mx]
        ctx.fillStyle = TILE_COLORS[baseTile.type]
        drawCellWalls(ctx, px, py, charWidth, charHeight, iso, lift)
      }

      const shootingStarOnLand = targetedStarMap.get(tileKey)
      const previewTile = previewMap.get(tileKey)

      const sessionColor = state.multiplayerSession ? PLAYER_COLORS[state.multiplayerSession.color].hex : PLAYER_COLOR

      if (mx === player.x && my === player.y && state.playerSpawn.visible) {
        if (previewTile) {
          ctx.fillStyle = previewTile.color
          ctx.fillText(previewTile.char, px, pyLift)
        }
        // Deep time glyph crossfade: ö fades out, @ fades in
        if (state.deepTimeTransition && state.deepTime?.active) {
          const glyphElapsed = time - state.deepTimeTransition.startTime
          const glyphT = Math.max(0, Math.min(glyphElapsed / DEEP_TIME_TRANSITION_GLYPH_DURATION_MS, 1))
          // Draw old glyph fading out
          ctx.globalAlpha = 1 - glyphT
          ctx.fillStyle = state.deepTime.playerGlyphColor
          ctx.fillText(state.deepTime.playerGlyph, playerScreen.px, playerScreen.py + playerLift)
          // Draw new glyph fading in
          ctx.globalAlpha = glyphT
          ctx.fillStyle = sessionColor
          ctx.fillText(PLAYER_CHAR, playerScreen.px, playerScreen.py + playerLift)
          ctx.globalAlpha = 1
          // Skip the normal draw path for this tile
          char = PLAYER_CHAR
          color = sessionColor
          cursorable = false
          continue
        }
        char = state.deepTime?.active ? state.deepTime.playerGlyph : PLAYER_CHAR
        color = state.deepTime?.active ? state.deepTime.playerGlyphColor : sessionColor
        cursorable = false
      } else if (remotePlayerMap.has(tileKey)) {
        const rp = remotePlayerMap.get(tileKey)
        char = PLAYER_CHAR
        color = rp?.color ?? PLAYER_COLOR
        isEntity = true
      } else if (characterMap.has(tileKey)) {
        const ch = characterMap.get(tileKey)
        char = ch?.glyph ?? 'G'
        color = ch?.color ?? '#FFFFFF'
        // Characters visible in genesis (Gron, coyote) stay at full opacity
        // during the transition — only fade entities not rendered in genesis
        if (isTransitioning) {
          const isGenesisVisible = ch?.id === 'gron' || ch?.id === 'coyote'
          if (!isGenesisVisible) isEntity = true
        } else {
          isEntity = true
        }
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
      } else if (monarchPositions.has(tileKey)) {
        char = MONARCH_CHAR
        color = MONARCH_COLOR
        isEntity = true
      } else if (beePositions.has(tileKey)) {
        char = BEE_CHAR
        color = BEE_COLOR
        isEntity = true
      } else if (satelliteMap.has(tileKey)) {
        const sat = satelliteMap.get(tileKey)
        char = sat?.char ?? '░'
        color = sat?.color ?? '#FF4444'
      } else if (satelliteImpactMap.has(tileKey)) {
        const si = satelliteImpactMap.get(tileKey)
        char = si?.char ?? '░'
        color = si?.color ?? '#FF4444'
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
          char = entranceGlyphMap.get(tileKey) ?? TILE_CHARS[tile.type]
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
        if (pathTile.type === TileType.CaveEntrance || pathTile.type === TileType.RuinEntrance) {
          char = entranceGlyphMap.get(tileKey) ?? TILE_CHARS[pathTile.type]
          color = ACTION_COLOR
        } else {
          char = waypointPositions.has(tileKey) ? '+' : '\u00b7'
          color = ACTION_COLOR
        }
      } else if (hoverPathPositions.has(tileKey)) {
        const hoverTile = map[my][mx]
        char = entranceGlyphMap.get(tileKey) ?? TILE_CHARS[hoverTile.type]
        color = HOVER_PATH_COLOR
      } else if (trailMap.has(tileKey)) {
        const tile = map[my][mx]
        char = entranceGlyphMap.get(tileKey) ?? TILE_CHARS[tile.type]
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
          char = entranceGlyphMap.get(tileKey) ?? TILE_CHARS[tile.type]
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
            if (state.craters.has(tileKey)) {
              const h = tileHash(mx, my)
              char = BUILDING_CHARS[h % BUILDING_CHARS.length]
              const craterColors = ['#8B4513', '#7A3B10', '#6B320D', '#5C290A', '#4D2007']
              color = craterColors[h % craterColors.length]
            } else if (state.burnScars.has(tileKey)) {
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
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, iso, ACTION_COLOR)
        ctx.fillStyle = color
        ctx.fillText(char, px, pyLift)
        continue
      }

      // Dev entity preview: show glyph with pink background at hovered tile
      if (mx === state.devEntityPreview?.x && my === state.devEntityPreview?.y) {
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, iso, ACTION_COLOR)
        ctx.fillStyle = state.devEntityPreview.color
        ctx.fillText(state.devEntityPreview.char, px, pyLift)
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
      } else if (selectedPositions.has(tileKey)) {
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, iso, ACTION_COLOR)
        ctx.fillStyle = BG_COLOR
      } else if (state.playerSelected && state.playerSpawn.visible && mx === player.x && my === player.y) {
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, iso, ACTION_COLOR)
        ctx.fillStyle = BG_COLOR
      } else if (isAngelGroupHighlighted) {
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, iso, ACTION_COLOR)
        ctx.fillStyle = BG_COLOR
      } else if ((isCursor && cursorable) || isFacingEntity || isPendingTarget) {
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, iso, ACTION_COLOR)
        ctx.fillStyle = BG_COLOR
      } else {
        ctx.fillStyle = color
      }

      // Multilayer drawing for ruin tiles (non-entity, non-highlighted, no overlay)
      const tile = map[my]?.[mx]
      const isRuinMultilayer = shouldRenderRuinMultilayer({
        zone: state.currentZone,
        tileType: tile?.type,
        isPlayer: mx === player.x && my === player.y && state.playerSpawn.visible,
        isEntity,
        hasPreview: previewTile !== undefined,
        isHighlighted:
          isAngelGroupHighlighted || (isCursor && cursorable) || isFacingEntity || isPendingTarget,
        hasOverlay:
          pathPositions.has(tileKey) || hoverPathPositions.has(tileKey) || trailMap.has(tileKey),
      })
      if (isRuinMultilayer) {
        const layers = getRuinTileLayers(tile.type, mx, my, time)
        const offsetScale = charWidth * 0.25
        for (const layer of layers) {
          ctx.fillStyle = layer.color
          ctx.fillText(layer.char, px + layer.dx * offsetScale, pyLift + layer.dy * offsetScale)
        }
      } else if (mx === player.x && my === player.y) {
        ctx.fillText(char, playerScreen.px, playerScreen.py + playerLift)
      } else {
        ctx.fillText(char, px, pyLift)
      }

      if (applyEntityFade) ctx.globalAlpha = 1
    }
  }

  // Smooth-movement post-pass — draw tweening ECS entities at fractional pixel positions
  for (const t of tweenedEntities) {
    const { px, py } = worldToScreen(t.lerpX, t.lerpY, camera, charWidth, charHeight, iso, viewportWidth, viewportHeight)
    ctx.fillStyle = t.color
    ctx.fillText(t.char, px, py + liftAt(Math.floor(t.lerpX), Math.floor(t.lerpY)))
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
        if (!isTileInVisibleViewport(vx, vy, iso, viewportWidth, viewportHeight)) continue

        // Skip the character's own tile and the player tile
        if (wx === cx && wy === cy) continue
        if (wx === player.x && wy === player.y) continue

        // Per-tile seed mixed with rainSeed so pattern varies per game load
        const h = tileHash(wx + state.rainSeed, wy)
        if (h % RAIN_AURA_DENSITY !== 0) continue

        // Animate: offset by time so drops appear to fall
        const phase = ((h >> 4) + Math.floor(time * RAIN_AURA_SPEED)) % RAIN_AURA_CHARS.length
        const colorPhase = ((h >> 8) + Math.floor(time * RAIN_AURA_SPEED * 0.7)) % RAIN_AURA_COLORS.length

        const { px: rpx, py: rpy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
        ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
        ctx.fillText(RAIN_AURA_CHARS[phase], rpx, rpy + liftAt(wx, wy))
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

    const { px: rpx, py: rpy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
    ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
    ctx.fillText(RAIN_AURA_CHARS[phase], rpx, rpy + liftAt(wx, wy))
  }

  // Weather rain overlay — animated rain follows the sweeping rain front (overworld only)
  // Uses rainIntensity for fade in/out and isInRainFront for blotchy edges
  if (state.rainIntensity > 0 && zone === Zone.Overworld) {
    const savedAlpha = ctx.globalAlpha
    const rainBounds = getVisibleTileBounds(iso, viewportWidth, viewportHeight)

    for (let vy = rainBounds.vyStart; vy < rainBounds.vyEnd; vy++) {
      for (let vx = rainBounds.vxStart; vx < rainBounds.vxEnd; vx++) {
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

        const { px: rpx, py: rpy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
        ctx.fillStyle = RAIN_AURA_COLORS[colorPhase]
        ctx.fillText(RAIN_AURA_CHARS[phase], rpx, rpy + liftAt(wx, wy))
      }
    }

    ctx.globalAlpha = savedAlpha
  }

  // Glinting zone sparkle overlay — overworld only
  if (zone === Zone.Overworld) {
    const glintBounds = getVisibleTileBounds(iso, viewportWidth, viewportHeight)
    for (let vy = glintBounds.vyStart; vy < glintBounds.vyEnd; vy++) {
      for (let vx = glintBounds.vxStart; vx < glintBounds.vxEnd; vx++) {
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

        const { px: gpx, py: gpy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
        ctx.fillStyle = GLINT_ZONE_COLORS[glintColorPhase]
        ctx.fillText(GLINT_ZONE_CHARS[glintPhase], gpx, gpy + liftAt(wx, wy))
      }
    }

    // Glinting beam overlay — '/' beams pour from upper-right to ~30% of glinting tiles
    const savedAlpha = ctx.globalAlpha
    for (const key of state.glintZones) {
      const sep = key.indexOf(',')
      if (sep < 0) continue
      const sx = Number(key.slice(0, sep))
      const sy = Number(key.slice(sep + 1))
      if (!tileHasBeam(sx, sy, state.rainSeed)) continue
      const patchOpacity = state.glintOpacity.get(key) ?? 0
      if (patchOpacity <= 0) continue

      const length = tileBeamLength(sx, sy, state.rainSeed)
      const beamMax = tileBeamMaxOpacity(sx, sy, state.rainSeed)
      if (beamMax <= 0) continue
      const colorIndex = tileHash(sx + state.rainSeed, sy + 1) % GLINT_ZONE_COLORS.length

      for (let i = 0; i < length; i++) {
        const wx = sx + i + 1
        const wy = sy - i - 1
        const vx = wx - camera.x
        const vy = wy - camera.y
        if (vx < 0 || vx >= viewportWidth || vy < 0 || vy >= viewportHeight) continue

        const segOpacity = computeBeamSegmentOpacity(i, length, time)
        const finalOpacity = patchOpacity * segOpacity * beamMax
        if (finalOpacity <= 0) continue

        ctx.globalAlpha = finalOpacity
        ctx.fillStyle = GLINT_ZONE_COLORS[colorIndex]
        const { px: bPx, py: bPy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
        ctx.fillText(GLINT_BEAM_CHAR, bPx, bPy + liftAt(wx, wy))
      }
    }
    ctx.globalAlpha = savedAlpha
  }

  // Deep Time burning overlay — fire characters on burning tiles
  if (state.deepTime?.active && state.deepTime.phase === DeepTimePhase.Burning) {
    const burnBounds = getVisibleTileBounds(iso, viewportWidth, viewportHeight)
    for (let vy = burnBounds.vyStart; vy < burnBounds.vyEnd; vy++) {
      for (let vx = burnBounds.vxStart; vx < burnBounds.vxEnd; vx++) {
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

        const { px: rpx, py: rpy } = viewportToScreen(vx, vy, charWidth, charHeight, iso, viewportWidth, viewportHeight)
        ctx.fillStyle = fireColors[colorPhase]
        ctx.fillText(fireChars[phase], rpx, rpy + liftAt(wx, wy))
      }
    }
  }

  // Deep Time year counter moved to Sidebar.tsx

  // Restore canvas transform before screen-level overlays (edge indicator,
  // off-screen player arrow, lightning flash, ejection fade, RTS box).
  if (worldTransformActive) {
    ctx.restore()
  }

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

  // RTS selection box overlay
  if (state.selectionBox) {
    const box = state.selectionBox
    const x = Math.min(box.startScreen.x, box.endScreen.x)
    const y = Math.min(box.startScreen.y, box.endScreen.y)
    const w = Math.abs(box.endScreen.x - box.startScreen.x)
    const h = Math.abs(box.endScreen.y - box.startScreen.y)
    ctx.fillStyle = 'rgba(255, 105, 180, 0.15)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = ACTION_COLOR
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, w, h)
  }

  // Move-order markers
  for (const marker of state.moveOrderMarkers) {
    const elapsed = time - marker.time
    if (elapsed >= MOVE_ORDER_MARKER_DURATION_MS) continue
    const alpha = 1 - elapsed / MOVE_ORDER_MARKER_DURATION_MS
    const { px: sx, py: sy } = worldToScreen(marker.position.x, marker.position.y, camera, charWidth, charHeight, iso, viewportWidth, viewportHeight)
    const syLift = sy + liftAt(marker.position.x, marker.position.y)
    ctx.globalAlpha = alpha
    drawCellHighlight(ctx, sx, syLift, charWidth, charHeight, iso, ACTION_COLOR)
    ctx.fillStyle = BG_COLOR
    ctx.fillText('X', sx, syLift)
    ctx.globalAlpha = 1
  }

  // RTS edge-scroll active-edge indicator: hot-pink lines along whichever
  // canvas edges the cursor is currently inside. Includes an inner glow
  // gradient extending into the playfield so the active edge reads as
  // illuminated rather than a flat line.
  {
    const dirX = state.edgeScrollDirection.dx
    const dirY = state.edgeScrollDirection.dy
    if (dirX !== 0 || dirY !== 0) {
      const visibleWidthPx = (viewportWidth - state.rightInsetTiles) * charWidth
      const t = EDGE_SCROLL_INDICATOR_THICKNESS_PX
      const glowDepth = Math.max(charWidth * 1.5, 24) // px the glow extends inward

      const drawEdgeGlow = (
        edge: 'left' | 'right' | 'top' | 'bottom',
      ) => {
        let gradient: CanvasGradient
        let solidX = 0
        let solidY = 0
        let solidW = 0
        let solidH = 0
        let glowX = 0
        let glowY = 0
        let glowW = 0
        let glowH = 0
        if (edge === 'left') {
          solidX = 0; solidY = 0; solidW = t; solidH = pxHeight
          glowX = t; glowY = 0; glowW = glowDepth; glowH = pxHeight
          gradient = ctx.createLinearGradient(t, 0, t + glowDepth, 0)
        } else if (edge === 'right') {
          solidX = visibleWidthPx - t; solidY = 0; solidW = t; solidH = pxHeight
          glowX = visibleWidthPx - t - glowDepth; glowY = 0; glowW = glowDepth; glowH = pxHeight
          gradient = ctx.createLinearGradient(visibleWidthPx - t - glowDepth, 0, visibleWidthPx - t, 0)
          gradient.addColorStop(0, 'rgba(255, 105, 180, 0)')
          gradient.addColorStop(1, 'rgba(255, 105, 180, 0.35)')
          ctx.fillStyle = gradient
          ctx.fillRect(glowX, glowY, glowW, glowH)
          ctx.fillStyle = ACTION_COLOR
          ctx.fillRect(solidX, solidY, solidW, solidH)
          return
        } else if (edge === 'top') {
          solidX = 0; solidY = 0; solidW = visibleWidthPx; solidH = t
          glowX = 0; glowY = t; glowW = visibleWidthPx; glowH = glowDepth
          gradient = ctx.createLinearGradient(0, t, 0, t + glowDepth)
        } else {
          solidX = 0; solidY = pxHeight - t; solidW = visibleWidthPx; solidH = t
          glowX = 0; glowY = pxHeight - t - glowDepth; glowW = visibleWidthPx; glowH = glowDepth
          gradient = ctx.createLinearGradient(0, pxHeight - t - glowDepth, 0, pxHeight - t)
          gradient.addColorStop(0, 'rgba(255, 105, 180, 0)')
          gradient.addColorStop(1, 'rgba(255, 105, 180, 0.35)')
          ctx.fillStyle = gradient
          ctx.fillRect(glowX, glowY, glowW, glowH)
          ctx.fillStyle = ACTION_COLOR
          ctx.fillRect(solidX, solidY, solidW, solidH)
          return
        }
        // Default (left, top): glow fades from solid edge inward.
        gradient.addColorStop(0, 'rgba(255, 105, 180, 0.35)')
        gradient.addColorStop(1, 'rgba(255, 105, 180, 0)')
        ctx.fillStyle = gradient
        ctx.fillRect(glowX, glowY, glowW, glowH)
        ctx.fillStyle = ACTION_COLOR
        ctx.fillRect(solidX, solidY, solidW, solidH)
      }

      if (dirX < 0) drawEdgeGlow('left')
      if (dirX > 0) drawEdgeGlow('right')
      if (dirY < 0) drawEdgeGlow('top')
      if (dirY > 0) drawEdgeGlow('bottom')
    }
  }

  // Off-screen player indicator: when free-pan moves the camera away from
  // the player, draw a hot-pink chunk with an arrow glyph at the playfield
  // edge nearest the player. Uses ASCII (>, <, ^, v) so any monospace font
  // renders it. Visible inside the playfield rect (excluding sidebar).
  if (state.cameraMode === 'free') {
    const visibleWidthPx = (viewportWidth - state.rightInsetTiles) * charWidth
    const { px: ppx, py: ppy } = worldToScreen(
      player.x,
      player.y,
      camera,
      charWidth,
      charHeight,
      iso,
      viewportWidth,
      viewportHeight,
    )
    const margin = charWidth * 1.5
    const offscreen =
      ppx < margin ||
      ppx > visibleWidthPx - margin ||
      ppy < margin ||
      ppy > pxHeight - margin
    if (offscreen) {
      const cx = visibleWidthPx / 2
      const cy = pxHeight / 2
      const dx = ppx - cx
      const dy = ppy - cy
      // Intersection of the line center→player with the inset rect.
      const halfW = visibleWidthPx / 2 - margin
      const halfH = pxHeight / 2 - margin
      const tx = dx === 0 ? Infinity : halfW / Math.abs(dx)
      const ty = dy === 0 ? Infinity : halfH / Math.abs(dy)
      const t = Math.min(tx, ty)
      const ax = cx + dx * t
      const ay = cy + dy * t
      const arrow = pickArrowGlyph(dx, dy)
      // Pink rectangle backdrop + dark arrow glyph for high contrast,
      // independent of projection mode (always rectangular here so it
      // reads as UI rather than a tile).
      ctx.fillStyle = ACTION_COLOR
      ctx.fillRect(ax - charWidth, ay - charHeight / 2, 2 * charWidth, charHeight)
      ctx.fillStyle = BG_COLOR
      ctx.fillText(arrow, ax - charWidth / 2, ay - charHeight / 2)
    }
  }
}

const pickArrowGlyph = (dx: number, dy: number): string => {
  // ASCII-only glyphs so any monospace font renders them. Dominant axis
  // wins; pure diagonals fall through to corner brackets.
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax > ay * 1.5) return dx > 0 ? '>' : '<'
  if (ay > ax * 1.5) return dy > 0 ? 'v' : '^'
  if (dx > 0 && dy > 0) return '\\'
  if (dx > 0 && dy < 0) return '/'
  if (dx < 0 && dy > 0) return '/'
  return '\\'
}
