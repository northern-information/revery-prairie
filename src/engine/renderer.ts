import { getAngelRenderData } from './angelAnimation'
import { projectBoltPath } from './boltPath'
import { getCaveTileLayers, shouldRenderCaveMultilayer } from './cave'
import { getCharacterDefinition } from './characters'
import {
  ACTION_COLOR,
  ANGEL_BODY_SIZE,
  BASE_FONT_SIZE,
  BEE_CHAR,
  BEE_COLOR,
  BEEHIVE_CHAR,
  BEEHIVE_COLOR,
  BG_COLOR,
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
  DEEP_TIME_SHAKE_AMPLITUDE,
  DEEP_TIME_TRANSITION_GLYPH_DURATION_MS,
  DIRT_COLORS,
  EXPLOSION_CHARS,
  EXPLOSION_COLORS,
  EXPLOSION_DURATION_MS,
  EXPLOSION_RADIUS,
  FOG_EXPLORED_BRIGHTNESS,
  GENESIS_FONT_SIZE,
  getEntranceGlyph,
  LIGHTNING_BOLT_COLOR_BRIGHT,
  LIGHTNING_BOLT_COLOR_DIM,
  LIGHTNING_BOLT_COLOR_MID,
  LIGHTNING_DURATION_MS,
  LIGHTNING_FLASH_MS,
  LIGHTNING_IMPACT_CHARS,
  LIGHTNING_IMPACT_COLORS,
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
  PRAIRIE_HALO_MAX_ALPHA,
  PRAIRIE_HALO_PULSE_SPEED,
  PRAIRIE_HALO_RADIUS,
  RIVER_COLOR,
  SAND_COLORS,
  SATELLITE_HEAD_COLORS,
  SATELLITE_IMPACT_DURATION_MS,
  SATELLITE_IMPACT_RADIUS_VISUAL,
  SATELLITE_SHAKE_AMPLITUDE,
  SATELLITE_TRAIL_COLORS,
  SHOOTING_STAR_HEAD_CHAR,
  SHOOTING_STAR_HEAD_COLOR,
  SHOOTING_STAR_TRAIL_CHARS,
  SHOOTING_STAR_TRAIL_COLORS,
  TILE_CHARS,
  TILE_COLORS,
  TRAIL_DURATION_MS,
  WILDFIRE_CHARS,
  WILDFIRE_COLORS,
  WILDFIRE_DURATION_MS,
} from './constants'
import { ComponentType } from './ecs/types'
import { GENESIS_EPOCHS } from './genesis'
import { renderGenesis } from './genesisRenderer'
import { getDefinition } from './items'
import { getTweenLerp } from './movementTween'
import { isInBounds, posKey, tileHash } from './position'
import {
  drawCellBackground,
  drawCellHighlight,
  drawCellWalls,
  viewportToScreen,
  worldDeltaToIsoPx,
  worldToScreen,
} from './projection'
import { runPassesInSlot } from './render/passes'
import { getRuinTileLayers, shouldRenderRuinMultilayer } from './ruins'
import { getSelectedUnitPositions } from './selection'
import {
  ANGEL_FLOAT_LIFT_PX,
  darkenColor,
  getStructurePlatformLift,
  getTierLift,
  getTileBgColor,
  WALL_LEFT_SHADE,
  WALL_RIGHT_SHADE,
  WATER_SINK_PX,
} from './tileBg'

import './render/passes/index'

import { getTierGrid as getTierGridShared, liftAt as liftAtShared } from './render/tierGrid'
import { FloraStage, DeepTimePhase, TileType, Zone } from './types'
import { computeZoneVisibility, dimColor, getTileVisibility, hasFogOfWar } from './visibility'
import { isEntityInCurrentZone } from './zone'
import { PLAYER_COLORS } from '@revery-prairie/shared'

import './flora'

import { FLORA_SPECIES, getFloraMovement, getFloraSwayOffset } from './flora'

import type { VelocityKey } from './constants'
import type { CharMetrics, GameState } from './types'

const STAR_CHARS = ['.', '+', '*']
const STAR_COLORS = ['#333', '#555', '#777', '#999', '#bbb', '#999', '#777', '#555']
const STAR_DENSITY = 12 // ~1 in 12 tiles gets a star
const TWINKLE_SPEED = 0.0015 // cycles per millisecond

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
  maxRadius: number
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

export const measureChar = (ctx: CanvasRenderingContext2D, fontSize: number = BASE_FONT_SIZE): CharMetrics => {
  const font = `${String(fontSize)}px monospace`
  ctx.font = font
  const metrics = ctx.measureText('M')
  const charWidth = metrics.width
  const charHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + 2
  return { charWidth, charHeight, font }
}

// Re-exported for back-compat — moved to visibility.ts so the fog mask pass
// (world-overlay) and central tile loop share one cached visible set.
export { getLastVisibleSet } from './visibility'
/** @deprecated Use getLastVisibleSet instead. */
export { getLastVisibleSet as getLastCaveVisibleSet } from './visibility'

// ── Canvas state tracking ──
// ctx.font and ctx.textBaseline are stable across frames but reset whenever
// canvas.width or canvas.height is assigned (which resets the full 2D context).
// Track last-set values so we only call the setters when something actually changed.
let _lastFont = ''
let _lastCanvasW = -1
let _lastCanvasH = -1

// ── Pooled render collections ──
// Reused every frame to avoid per-frame allocation / GC pressure.
const _beePositions = new Set<string>()
const _monarchPositions = new Set<string>()
const _groundItemMap = new Map<string, { definitionId: string; glinting?: boolean }>()
const _previewMap = new Map<string, { char: string; color: string; isValid: boolean }>()
const _pathPositions = new Set<string>()
const _waypointPositions = new Set<string>()
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
const _crumbleMap = new Map<string, { char: string; color: string }>()
const _entranceGlyphMap = new Map<string, string>()

// Genesis renders at GENESIS_FONT_SIZE for a zoomed-out view of the
// whole prairie. Gameplay renders at BASE_FONT_SIZE for crisp ASCII.
// We measure the genesis-font metrics on demand and cache them. The
// boot title card covers the renderer swap, so any minor pixel
// difference between the two paths is invisible.
let _genesisMetrics: CharMetrics | null = null

export const render = (ctx: CanvasRenderingContext2D, state: GameState, metrics: CharMetrics, time: number): void => {
  // Genesis mode — delegate to genesis renderer at its own font size.
  // Note: we stay in genesis-render mode even after epochIndex has
  // advanced past the last epoch. completeGenesis schedules a title
  // card; genesis keeps painting (last frame) underneath the rising
  // black overlay until finalizeGenesisHandoff clears state.genesis at
  // the hold midpoint.
  if (state.genesis) {
    _genesisMetrics ??= measureChar(ctx, GENESIS_FONT_SIZE)
    // The canvas is sized to viewportWidth * BASE_FONT_SIZE char-widths.
    // Genesis paints at GENESIS_FONT_SIZE so each tile is smaller; the
    // tile-count viewport scales up proportionally so the prairie fills
    // the canvas at the zoomed-out font.
    const gameCharWidth = metrics.charWidth
    const gameCharHeight = metrics.charHeight
    const genesisViewportWidth = Math.ceil((state.viewportWidth * gameCharWidth) / _genesisMetrics.charWidth)
    const genesisViewportHeight = Math.ceil((state.viewportHeight * gameCharHeight) / _genesisMetrics.charHeight)
    renderGenesis(
      ctx,
      state.genesis,
      GENESIS_EPOCHS,
      _genesisMetrics,
      genesisViewportWidth,
      genesisViewportHeight,
      time
    )
    // Screen-overlay passes still run during genesis so the cinematic
    // commentary pass and the boot title card overlay can paint above
    // the genesis world. The genesis commentary uses _genesisMetrics so
    // its text scales with the zoomed-out font; the boot title card
    // uses the gameplay metrics passed in, so its label is rendered at
    // the gameplay viewport scale (full size).
    runPassesInSlot('screen-overlay', ctx, state, metrics, time)
    return
  }

  const { camera, viewportWidth, viewportHeight, map, player } = state
  const { charWidth, charHeight } = metrics

  // Cosmetic terrain elevation: each tile snaps to a discrete tier
  // (0..ELEVATION_TIER_COUNT-1) and lifts by tier * ELEVATION_TIER_LIFT_PX.
  // Every tile renders as a cube — see the wall draw site for details.
  //
  // The renderer reads tier per tile in several hot paths (bg pre-pass,
  // wall depth calc, entity lift, overlays). To avoid 60k+ posKey
  // string allocations + Map.get calls per frame, the tier values are
  // cached into a flat Int8Array indexed by mx + my * mapWidth, rebuilt
  // only when state.elevation reference changes (which only happens at
  // genesis / state init).
  const tierGrid = getTierGridShared(state.elevation, state.mapWidth, state.mapHeight)
  const tierAt = (mx: number, my: number): number => {
    if (mx < 0 || mx >= state.mapWidth || my < 0 || my >= state.mapHeight) return 0
    return tierGrid[mx + my * state.mapWidth]
  }
  const liftAt = (mx: number, my: number): number => liftAtShared(tierGrid, mx, my, state.mapWidth, state.mapHeight)

  // Positive pixel offset that sinks water tiles below surrounding
  // dirt. Reads state.rivers / state.ponds (overworld only — caves and
  // ruin interiors have no water sets). Returns 0 for non-water tiles
  // so callers can add it unconditionally. Mirrors the same helper in
  // tileBgCache.ts so the cached bg fill, the per-frame glyph, and the
  // wall depth math all agree on the same vertical anchor.
  const waterSinkAt = (mx: number, my: number): number => {
    if (state.currentZone !== Zone.Overworld) return 0
    if (mx < 0 || mx >= state.mapWidth || my < 0 || my >= state.mapHeight) return 0
    const key = posKey(mx, my)
    if (state.rivers.has(key) || state.ponds.has(key)) return WATER_SINK_PX
    return 0
  }

  // Effective tile lift = tier lift + water sink. Wall pass uses this
  // so a dirt tile next to water gets a taller wall on the water side.
  // Out-of-bounds and space tiles fall through to a virtual sub-ground
  // tier (-1) via wallNeighborTier; water sink is land-only.
  const tileLiftAt = (mx: number, my: number): number => liftAt(mx, my) + waterSinkAt(mx, my)
  const wallNeighborLiftAt = (mx: number, my: number): number => {
    if (mx < 0 || mx >= state.mapWidth || my < 0 || my >= state.mapHeight) return getTierLift(-1)
    if (map[my][mx].type === TileType.Space) return getTierLift(-1)
    return tileLiftAt(mx, my)
  }

  const pxWidth = viewportWidth * charWidth
  const pxHeight = viewportHeight * charHeight
  ctx.clearRect(0, 0, pxWidth, pxHeight)
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, pxWidth, pxHeight)

  // Only re-apply font/baseline when the canvas was reset (resize/zoom) or
  // font changed. Assigning canvas.width/height resets the entire 2D context,
  // so we detect that via pxWidth/pxHeight changing.
  if (metrics.font !== _lastFont || pxWidth !== _lastCanvasW || pxHeight !== _lastCanvasH) {
    ctx.font = metrics.font
    ctx.textBaseline = 'top'
    _lastFont = metrics.font
    _lastCanvasW = pxWidth
    _lastCanvasH = pxHeight
  }

  // Camera shake — translate entire canvas during impacts or deep time
  const deepTimeShake = state.deepTime?.active === true && time < state.deepTime.shakeUntil
  const satelliteShake = time < state.screenShakeUntil
  const shakeActive = deepTimeShake || satelliteShake

  // Player tween: resolve the fractional lerp first so the world translate
  // below can compose it with edge-scroll drift and screen shake. The
  // player glyph itself draws at the integer tile through worldToScreen;
  // the world translate carries it to the visually correct sub-tile
  // position. Clearing state.playerTween at lerp.t === 1 produces no
  // visual snap because the offset is already zero on that frame.
  let playerTweenT = 1
  let playerTweenFromX = player.x
  let playerTweenFromY = player.y
  if (state.playerTween) {
    playerTweenFromX = state.playerTween.fromX
    playerTweenFromY = state.playerTween.fromY
    const lerp = getTweenLerp(state.playerTween, time, player.x, player.y)
    if (lerp.t >= 1) {
      state.playerTween = null
    } else {
      playerTweenT = lerp.t
    }
  }
  const playerLerpX = playerTweenFromX + (player.x - playerTweenFromX) * playerTweenT
  const playerLerpY = playerTweenFromY + (player.y - playerTweenFromY) * playerTweenT

  // The player-follow tween produces sub-tile drift: while playerTween is
  // active, state.player.x/y has already snapped to the destination tile
  // (so the camera centers on the destination), but the visual world
  // position is mid-step. Without the offset below, world tiles would jump
  // one full tile every 100ms move tick while the player glyph fights it
  // — making the player look choppy even though the tween math is correct.
  // The world translate keeps tile indexing integer while the canvas
  // slides smoothly.
  //
  // Per-axis gating: updateCamera only tracks the player on an axis when
  // the map is at least as large as the visible viewport on that axis.
  // On a smaller map (e.g. the 40x25 cave inside an 80+ wide viewport),
  // the camera is fixed-centered and never moves with the player. In
  // that case there is no camera-snap to compensate for, and the world
  // must NOT translate — the player should slide across stationary
  // tiles. Mirror updateCamera's check exactly so the renderer's offset
  // matches what the camera actually did this frame.
  const visibleWidth = state.viewportWidth - state.rightInsetTiles
  const xCameraTracksPlayer = state.mapWidth >= visibleWidth
  const yCameraTracksPlayer = state.mapHeight >= state.viewportHeight
  const tweenDelta = worldDeltaToIsoPx(
    xCameraTracksPlayer ? playerLerpX - player.x : 0,
    yCameraTracksPlayer ? playerLerpY - player.y : 0,
    charWidth,
    charHeight
  )
  const driftPx = tweenDelta.px
  const driftPy = tweenDelta.py

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

  // Player glyph projects from the fractional lerp position. With the
  // world translate above (which shifts everything to compensate for the
  // camera snap), drawing the player at lerp lands the glyph at canvas
  // center across the entire tween: lerp-position is already (player -
  // tweenDelta) in screen space, and the translate adds tweenDelta back,
  // for a net of zero displacement at every t. Selection/cursor
  // highlights stay anchored to the integer player tile via px/pyLift in
  // the central tile loop.
  const playerScreen = worldToScreen(
    playerLerpX,
    playerLerpY,
    camera,
    charWidth,
    charHeight,
    viewportWidth,
    viewportHeight
  )
  // Vertical lift interpolates between from-tile and to-tile so cube-step
  // elevation changes don't snap the player up or down at tween start.
  const playerLiftFrom = liftAt(playerTweenFromX, playerTweenFromY)
  const playerLiftTo = liftAt(player.x, player.y)
  const playerLift = playerLiftFrom + (playerLiftTo - playerLiftFrom) * playerTweenT

  // Zone filter helper — only render entities in the current zone (including ruinIndex match)
  const inZone = (eid: number): boolean => isEntityInCurrentZone(state, eid)

  // Clear pooled collections for this frame
  _beePositions.clear()
  _monarchPositions.clear()
  _groundItemMap.clear()
  _previewMap.clear()
  _pathPositions.clear()
  _waypointPositions.clear()
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
  _crumbleMap.clear()

  // Alias pooled collections for readability
  const beePositions = _beePositions
  const monarchPositions = _monarchPositions
  const groundItemMap = _groundItemMap
  const previewMap = _previewMap
  const pathPositions = _pathPositions
  const waypointPositions = _waypointPositions
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
  const crumbleMap = _crumbleMap

  // Build selected unit position set for highlight rendering
  const selectedPositions = getSelectedUnitPositions(state)

  // Deferred entity draw list: populated during the central tile loop
  // when the resolved tile is an entity (player, remote players,
  // characters, beehives, monarchs, bees, meteorites, ground items,
  // angel body pixels). Flushed after the tile loop and after the
  // tweened-entity post-pass, so no neighboring high-elevation tile's
  // cube wall or lifted glyph (drawn later in row-major order) can
  // overpaint an entity glyph.
  interface DeferredEntity {
    char: string
    color: string
    glyphPx: number
    glyphPy: number
    highlight: boolean
    highlightPx: number
    highlightPy: number
    alpha: number
  }
  const deferredEntities: DeferredEntity[] = []
  const deferredFloraGlyphs: { char: string; color: string; px: number; py: number }[] = []

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

  // Populate path positions for highlight rendering — only when the
  // current path was committed via shift+right-click (state.pathIsChained).
  // Plain right-click still walks the player but renders no path glyphs.
  const renderPathOverlay = state.pathIsChained
  if (state.path && renderPathOverlay) {
    for (const p of state.path) {
      pathPositions.add(posKey(p.x, p.y))
    }
  }

  // Populate waypoint positions for distinct markers (same gate)
  if (renderPathOverlay) {
    for (const w of state.pathWaypoints) {
      waypointPositions.add(posKey(w.x, w.y))
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
    // Trail — step backward along negated velocity. projection rotates
    // world deltas by 45° on screen, so pick a table whose glyphs match the
    // projected direction rather than the world-space direction.
    const velKey = posKey(vel.dx, vel.dy) as VelocityKey
    const trailTable = SHOOTING_STAR_TRAIL_CHARS
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

  // Populate angel body pixels (from ECS).
  // Track angel body tile groups so hovering/facing any tile highlights all.
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

    const { path: canonicalPath, branch: canonicalBranch } = data

    // Re-project the canonical tile-space path so the bolt reads as
    // vertical-on-screen. boltChar still reads from canonical dx so the
    // jagged silhouette is preserved.
    const projected = projectBoltPath(canonicalPath, canonicalBranch)
    const path = projected.path
    const branch = projected.branch ?? canonicalBranch

    // Determine bolt character for a segment based on dx from previous to current
    const boltChar = (dx: number): string => (dx === 0 ? '|' : dx > 0 ? '\\' : '/')

    // Phase 1: Flash (0 to LIGHTNING_FLASH_MS) — all bright white
    // Phase 2: Glow (LIGHTNING_FLASH_MS to 500ms) — dimming with flicker
    // Phase 3: Fade (500ms to LIGHTNING_DURATION_MS) — bottom-to-top disappearance
    if (elapsed < LIGHTNING_FLASH_MS) {
      // Flash: all segments bright white
      for (let i = 0; i < path.length; i++) {
        const dx = i > 0 ? canonicalPath[i].x - canonicalPath[i - 1].x : 0
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
        const dx = i > 0 ? canonicalPath[i].x - canonicalPath[i - 1].x : 0
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
        const dx = i > 0 ? canonicalPath[i].x - canonicalPath[i - 1].x : 0
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

  // bg-cache slot: tile bg + cube edges composite.
  runPassesInSlot('bg-cache', ctx, state, metrics, time)

  // Fog of war: compute visibility before world-overlay so the fog mask
  // pass (last in world-overlay) and the central tile loop below share
  // one cached visible set. Result is cached on visibility.ts module
  // state, readable via getLastVisibleSet().
  const fogActive = hasFogOfWar(state.currentZone)
  const visibleSet = fogActive ? computeZoneVisibility(state) : null

  // world-overlay slot: ruin entrance halo
  // range, angel gold aura, prairie halo composite, prairie outline, then
  // the fog-of-war mask (last, so it covers cached bg + every overlay above).
  // See src/engine/render/passes/.
  runPassesInSlot('world-overlay', ctx, state, metrics, time)

  // The visible footprint is a rotated rectangle. Expand the tile-loop
  // bounds so corner diamonds aren't clipped. Off-canvas writes are cheap
  // because the canvas clips them anyway.
  const tileLoopStart = -viewportHeight
  const tileLoopEndX = viewportWidth + viewportHeight
  const tileLoopEndY = viewportHeight + viewportWidth
  for (let vy = tileLoopStart; vy < tileLoopEndY; vy++) {
    for (let vx = tileLoopStart; vx < tileLoopEndX; vx++) {
      const mx = camera.x + vx
      const my = camera.y + vy

      const { px, py } = viewportToScreen(vx, vy, charWidth, charHeight, viewportWidth, viewportHeight)

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
        const deepTimeLocked = state.deepTime?.active === true && state.deepTime.phase !== DeepTimePhase.Wandering
        if (deepTimeLocked) {
          const h = tileHash(mx, my)
          const pulse = Math.sin(time * 0.003 + (h & 0xff) * 0.05) * 0.5 + 0.5
          const bgAlpha = 0.15 + 0.1 * pulse
          ctx.fillStyle = `rgba(139, 0, 0, ${String(bgAlpha)})`
          drawCellBackground(ctx, px, py, charWidth, charHeight)
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
      const tileTier = tierAt(mx, my)
      const lift = getTierLift(tileTier)
      const platformLift = state.currentZone === Zone.Overworld ? getStructurePlatformLift(map[my][mx].type) : 0
      const waterSink = waterSinkAt(mx, my)
      const pyLift = py + lift + platformLift + waterSink

      // Fog of war: skip unexplored tiles, dim partiallyDiscovered tiles.
      // fullyDiscovered tiles fall through to the full render path so live
      // entities show even when out of LOS.
      const tileVis = fogActive ? getTileVisibility(state, mx, my, visibleSet ?? new Set()) : ('visible' as const)
      if (tileVis === 'unexplored') {
        // Unexplored — leave as dark background
        continue
      }
      const tileIsPartiallyDiscovered = tileVis === 'partiallyDiscovered'

      const isFacingEntity = mx === state.facingEntityPos?.x && my === state.facingEntityPos?.y
      const isPendingTarget = mx === state.pendingInteractionTarget?.x && my === state.pendingInteractionTarget?.y

      // Resolve what to draw at this tile — priority order determines z-index
      let char: string
      let color: string
      // isEntity: true for elements that defer to the post-tile-loop flush
      // (ghosts, bees, characters, ground items, etc.) so neighboring
      // high-elevation tiles can't overpaint them.
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

      // Cosmetic elevation: walls render at tier transitions where
      // this tile sits higher than its south or east neighbor. Space
      // neighbors count as virtual sub-ground tier (-1), so coastal
      // tiles at tier 0 still produce a cliff face into the void.
      // Same-tier same-surface neighbors share a flat plateau; the
      // per-tile cube edge suggestion comes from the bg-cache edge
      // stroke. Hidden cave chamber tiles use the masked CaveWall
      // palette so the wall doesn't leak the underlying type.
      {
        // Wall depth in lift-space so water sinking participates: a
        // dirt tile sitting next to a sunken river gets a wall that
        // reaches down to the water surface, not just the dirt tier
        // below. Lifts are negative-when-up, so a taller (more
        // negative) self subtracted from a shorter neighbor yields a
        // positive depth.
        const selfLift = tileLiftAt(mx, my)
        const southLift = wallNeighborLiftAt(mx, my + 1)
        const eastLift = wallNeighborLiftAt(mx + 1, my)
        const leftDepth = Math.max(0, southLift - selfLift)
        const rightDepth = Math.max(0, eastLift - selfLift)
        if (leftDepth > 0 || rightDepth > 0) {
          const baseTile = map[my][mx]
          const wallType =
            state.currentZone === Zone.Cave && !state.caveRevealed && state.caveHiddenPositions.has(tileKey)
              ? TileType.CaveWall
              : baseTile.type
          const wallBg = getTileBgColor(wallType, mx, my)
          drawCellWalls(
            ctx,
            px,
            pyLift,
            charWidth,
            charHeight,
            leftDepth,
            rightDepth,
            darkenColor(wallBg, WALL_LEFT_SHADE),
            darkenColor(wallBg, WALL_RIGHT_SHADE)
          )
        }
      }

      const shootingStarOnLand = targetedStarMap.get(tileKey)
      const previewTile = previewMap.get(tileKey)

      const sessionColor = state.multiplayerSession ? PLAYER_COLORS[state.multiplayerSession.color].hex : PLAYER_COLOR

      if (mx === player.x && my === player.y && state.playerSpawn.visible) {
        if (previewTile) {
          ctx.fillStyle = previewTile.color
          ctx.fillText(previewTile.char, px, pyLift)
        }
        // Deep time glyph crossfade: ö fades out, @ fades in.
        // Both glyphs are deferred so they render above all terrain.
        if (state.deepTimeTransition && state.deepTime?.active) {
          const glyphElapsed = time - state.deepTimeTransition.startTime
          const glyphT = Math.max(0, Math.min(glyphElapsed / DEEP_TIME_TRANSITION_GLYPH_DURATION_MS, 1))
          deferredEntities.push({
            char: state.deepTime.playerGlyph,
            color: state.deepTime.playerGlyphColor,
            glyphPx: playerScreen.px,
            glyphPy: playerScreen.py + playerLift,
            highlight: false,
            highlightPx: px,
            highlightPy: pyLift,
            alpha: 1 - glyphT,
          })
          deferredEntities.push({
            char: PLAYER_CHAR,
            color: sessionColor,
            glyphPx: playerScreen.px,
            glyphPy: playerScreen.py + playerLift,
            highlight: false,
            highlightPx: px,
            highlightPy: pyLift,
            alpha: glyphT,
          })
          continue
        }
        char = state.deepTime?.active ? state.deepTime.playerGlyph : PLAYER_CHAR
        color = state.deepTime?.active ? state.deepTime.playerGlyphColor : sessionColor
      } else if (remotePlayerMap.has(tileKey)) {
        const rp = remotePlayerMap.get(tileKey)
        char = PLAYER_CHAR
        color = rp?.color ?? PLAYER_COLOR
        isEntity = true
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
      } else if (lightningMap.has(tileKey)) {
        const lp = lightningMap.get(tileKey)
        char = lp?.char ?? '|'
        color = lp?.color ?? '#FFFFFF'
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
      } else if (crumbleMap.has(tileKey)) {
        const cr = crumbleMap.get(tileKey)
        char = cr?.char ?? '#'
        color = cr?.color ?? '#997755'
      } else if (meteoritePositions.has(tileKey)) {
        char = METEORITE_CHAR
        isEntity = true
        if (pathPositions.has(tileKey)) {
          color = ACTION_COLOR
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
      } else if (state.floraGrowthPreviews.has(tileKey)) {
        const h = tileHash(mx, my)
        const phase = (h >> 8) % CLOVER_PREVIEW_COLORS.length
        const colorIndex = (phase + Math.floor(time * CLOVER_PREVIEW_BLINK_SPEED)) % CLOVER_PREVIEW_COLORS.length
        char = TILE_CHARS[TileType.Flora]
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
          // Flora tiles: glyph + healthy color come from the per-species
          // FLORA_SPECIES registry. Dying-stage colors are shared across
          // species (the chromatic decline reads as "dying plant"
          // regardless of family).
          const lifecycle = tile.type === TileType.Flora ? state.floraLifecycle.get(tileKey) : undefined
          if (tile.type === TileType.Flora && lifecycle) {
            const speciesDef = FLORA_SPECIES[lifecycle.species]
            char = speciesDef.glyph
            color = speciesDef.color
          }
          if (lifecycle && lifecycle.stage !== FloraStage.Healthy) {
            switch (lifecycle.stage) {
              case FloraStage.Brown:
                color = CLOVER_BROWN_COLOR
                break
              case FloraStage.BlinkingRed: {
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
              case FloraStage.Black:
                color = CLOVER_BLACK_COLOR
                break
              case FloraStage.Decomposing:
                color = CLOVER_DECOMPOSE_COLOR
                break
              default:
                color = CLOVER_HEALTHY_COLORS[tileHash(mx, my) % CLOVER_HEALTHY_COLORS.length]
            }
          } else if (tile.type === TileType.Flora && !lifecycle) {
            // Flora tile without a lifecycle entry — shouldn't normally
            // happen, but render the prior pre-multi-species mix as a
            // fallback to preserve visual variety.
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
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, ACTION_COLOR)
        ctx.fillStyle = color
        ctx.fillText(char, px, pyLift)
        continue
      }

      // Dev entity preview: show glyph with pink background at hovered tile
      if (mx === state.devEntityPreview?.x && my === state.devEntityPreview?.y) {
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, ACTION_COLOR)
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

      // Resolve highlight state without ctx side effects so the deferred
      // path can capture it and the inline path can apply it.
      // Invalid preview tiles (e.g. red X for lightning targeting) and the
      // dev panel suppress entity/target inversion.
      const highlightSuppressed = (previewTile !== undefined && !previewTile.isValid) || state.devPanelOpen
      const highlight =
        !highlightSuppressed &&
        (selectedPositions.has(tileKey) || isAngelGroupHighlighted || isFacingEntity || isPendingTarget)

      // Defer entity glyphs (and the local player on its own tile) to a
      // post-tile-loop flush so neighboring high-elevation tiles drawn
      // later in row-major order can never overpaint them. Angel body
      // pixels additionally lift by ANGEL_FLOAT_LIFT_PX so the multi-glyph
      // body floats above the tallest possible cube.
      const isAngelPixel = angelMap.has(tileKey)
      const isPlayerOwnTile = mx === player.x && my === player.y && state.playerSpawn.visible
      if (isEntity || isPlayerOwnTile) {
        const angelLift = isAngelPixel ? -ANGEL_FLOAT_LIFT_PX : 0
        const glyphPx = isPlayerOwnTile ? playerScreen.px : px
        const glyphPyBase = isPlayerOwnTile ? playerScreen.py + playerLift : pyLift
        deferredEntities.push({
          char,
          color: highlight ? BG_COLOR : color,
          glyphPx,
          glyphPy: glyphPyBase + angelLift,
          highlight,
          highlightPx: px,
          highlightPy: pyLift + angelLift,
          alpha: 1,
        })
        continue
      }

      // Flora wind sway: displaced glyphs are deferred and flushed after the
      // tile loop so no subsequent tile background can paint over them.
      // Only applied on the non-highlighted terrain path so the cursor
      // highlight box stays anchored to the tile centre.
      // Growth-preview tiles (dirt tiles showing a blinking clover glyph before
      // conversion) use the Clover profile so they sway in sync with live clover —
      // without this they snap to the displaced position the frame they convert.
      if (!highlight) {
        const swayTileType = state.floraGrowthPreviews.has(tileKey) ? TileType.Flora : map[my]?.[mx]?.type
        const floraProfile = swayTileType ? getFloraMovement(swayTileType) : undefined
        if (floraProfile) {
          const lifecycleStage = state.floraLifecycle.get(tileKey)?.stage
          const sway = getFloraSwayOffset(
            floraProfile,
            state,
            mx,
            my,
            time,
            state.currentZone,
            lifecycleStage,
            charWidth,
            charHeight,
            color
          )
          // Always defer — even zero-displacement — so tiles never switch between the
          // deferred and non-deferred draw paths. When the smooth wind vector passes
          // through zero (e.g. a W→E direction change), dx and dy become near-zero.
          // Allowing those tiles to fall through to the non-deferred path causes them
          // to be drawn in tile order and overdrawn by later tiles' backgrounds.
          deferredFloraGlyphs.push({ char, color: sway.color, px: px + sway.dx, py: pyLift + sway.dy })
          continue
        }
      }

      // Non-deferred path: terrain glyphs and overlay tiles. Apply the
      // highlight side effects here. Entity glyphs take the defer branch
      // above and are flushed after the tile loop.
      if (highlight) {
        drawCellHighlight(ctx, px, pyLift, charWidth, charHeight, ACTION_COLOR)
        ctx.fillStyle = BG_COLOR
      } else {
        ctx.fillStyle = color
      }

      // Multilayer drawing for ruin tiles (non-entity, non-highlighted, no overlay)
      const tile = map[my]?.[mx]
      // Cave hidden-chamber mask: a CaveFloor inside the hidden chamber must
      // render as CaveWall until caveRevealed flips, otherwise the multilayer
      // floor pattern would leak the unrevealed type.
      const caveEffectiveType =
        state.currentZone === Zone.Cave && !state.caveRevealed && state.caveHiddenPositions.has(tileKey)
          ? TileType.CaveWall
          : tile?.type
      const sharedMultilayerArgs = {
        isPlayer: mx === player.x && my === player.y && state.playerSpawn.visible,
        isEntity,
        hasPreview: previewTile !== undefined,
        isHighlighted: isAngelGroupHighlighted || isFacingEntity || isPendingTarget,
        hasOverlay: pathPositions.has(tileKey) || trailMap.has(tileKey),
      }
      const isRuinMultilayer = shouldRenderRuinMultilayer({
        zone: state.currentZone,
        tileType: tile?.type,
        ...sharedMultilayerArgs,
      })
      const isCaveMultilayer = shouldRenderCaveMultilayer({
        zone: state.currentZone,
        tileType: caveEffectiveType,
        ...sharedMultilayerArgs,
      })
      if (isRuinMultilayer) {
        const layers = getRuinTileLayers(tile.type, mx, my, time)
        const offsetScale = charWidth * 0.25
        for (const layer of layers) {
          ctx.fillStyle = layer.color
          ctx.fillText(layer.char, px + layer.dx * offsetScale, pyLift + layer.dy * offsetScale)
        }
      } else if (isCaveMultilayer && caveEffectiveType !== undefined) {
        const layers = getCaveTileLayers(caveEffectiveType, mx, my)
        const offsetScale = charWidth * 0.25
        for (const layer of layers) {
          ctx.fillStyle = layer.color
          ctx.fillText(layer.char, px + layer.dx * offsetScale, pyLift + layer.dy * offsetScale)
        }
      } else if (mx === player.x && my === player.y) {
        // Player tile when playerSpawn.visible is false — preserve the
        // existing behavior of drawing whatever glyph resolved at the
        // tween position rather than the iteration position.
        ctx.fillText(char, playerScreen.px, playerScreen.py + playerLift)
      } else {
        ctx.fillText(char, px, pyLift)
      }
    }
  }
  // Smooth-movement post-pass — draw tweening ECS entities at fractional pixel positions.
  // Apply the angel float lift for any tweened entity tagged as angel
  // body, so a tweening angel would still float above terrain. No
  // current entity hits this branch (angels move tile-discrete) but
  // the lift is captured here for forward compatibility.
  for (const t of tweenedEntities) {
    const { px, py } = worldToScreen(t.lerpX, t.lerpY, camera, charWidth, charHeight, viewportWidth, viewportHeight)
    const isAngel = state.world.getComponent(t.eid, ComponentType.AngelData) !== undefined
    const angelLift = isAngel ? -ANGEL_FLOAT_LIFT_PX : 0
    ctx.fillStyle = t.color
    ctx.fillText(t.char, px, py + liftAt(Math.floor(t.lerpX), Math.floor(t.lerpY)) + angelLift)
  }

  // Flush deferred flora glyphs — drawn after all terrain backgrounds so no
  // neighboring tile's background rectangle can clip a displaced glyph.
  // Flushed before entity glyphs so entities remain on top of flora.
  for (const f of deferredFloraGlyphs) {
    ctx.fillStyle = f.color
    ctx.fillText(f.char, f.px, f.py)
  }

  // Flush deferred entity glyphs collected during the central tile loop.
  // Runs after all terrain glyphs and cube walls have been drawn so no
  // neighboring tile can clip an entity. Highlights are deferred too so
  // the inversion box stays paired with the entity's lifted Y position
  // (e.g. an angel-group highlight tracks the floating angel body).
  for (const e of deferredEntities) {
    if (e.alpha !== 1) ctx.globalAlpha = e.alpha
    if (e.highlight) {
      drawCellHighlight(ctx, e.highlightPx, e.highlightPy, charWidth, charHeight, ACTION_COLOR)
    }
    ctx.fillStyle = e.color
    ctx.fillText(e.char, e.glyphPx, e.glyphPy)
    if (e.alpha !== 1) ctx.globalAlpha = 1
  }

  // effect slot: rain aura, weather rain, glint sparkle, glint beam,
  // deep time burning. See src/engine/render/passes/.
  runPassesInSlot('effect', ctx, state, metrics, time)

  // Deep Time year counter moved to Sidebar.tsx

  // Restore canvas transform before screen-level overlays. Screen-overlay
  // passes draw in canvas coordinates without the world transform.
  if (worldTransformActive) {
    ctx.restore()
  }

  // screen-overlay slot: lightning flash, angel flash, RTS selection box,
  // move-order markers, edge-scroll indicator, off-screen player arrow.
  // See src/engine/render/passes/.
  runPassesInSlot('screen-overlay', ctx, state, metrics, time)
}
