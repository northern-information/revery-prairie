import { generateBoltPath } from './boltPath'
import {
  BEE_CHAR,
  BEE_COLOR,
  BEEHIVE_CHAR,
  BEEHIVE_COLOR,
  ENTRANCE_GLYPHS,
  GHOST_CHAR,
  GHOST_COLOR,
  LIGHTNING_BOLT_COLOR_BRIGHT,
  LIGHTNING_BOLT_MAX_LENGTH,
  LIGHTNING_BOLT_MIN_LENGTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  METEORITE_CHAR,
  METEORITE_COLOR,
  MONARCH_CHAR,
  MONARCH_COLOR,
  SATELLITE_MAX_LENGTH,
  SATELLITE_MIN_LENGTH,
} from './constants'
import { ComponentType } from './ecs/types'
import { getDefinition } from './items'
import { setMapTile } from './map'
import { posKey } from './position'
import { generateRuinInterior } from './ruins'
import { RuinArchetype, TileType, Zone } from './types'
import { getCurrentEntityZone } from './zone'

import type { ComponentDataMap } from './ecs/types'
import type { CivilizationRuin } from './genesisTypes'
import type { GameState, Position } from './types'

// --- Known entity tags: must include every EntityTag string used in src/engine/ ---

export const ENTITY_TAG_SUGGESTIONS = [
  'angel',
  'bee',
  'beehive',
  'character',
  'crumble',
  'explosion',
  'groundItem',
  'lightning',
  'meteorite',
  'monarch',
  'pickupBloom',
  'reveryCast',
  'satellite',
  'waterReveryAura',
  'satelliteImpact',
  'shootingStar',
  'wildfire',
] as const

// --- Component metadata: describes each component's fields for the dev panel UI ---

export type FieldKind = 'number' | 'string' | 'boolean' | 'select'

export interface FieldMeta {
  name: string
  kind: FieldKind
  options?: string[]
}

export interface ComponentMeta {
  type: ComponentType
  label: string
  fields: FieldMeta[]
}

const pos = (name: string): FieldMeta => ({ name, kind: 'number' })
const str = (name: string): FieldMeta => ({ name, kind: 'string' })
const bool = (name: string): FieldMeta => ({ name, kind: 'boolean' })
const select = (name: string, options: string[]): FieldMeta => ({ name, kind: 'select', options })

export const COMPONENT_META: ComponentMeta[] = [
  { type: ComponentType.Position, label: 'Position', fields: [pos('x'), pos('y')] },
  {
    type: ComponentType.MovementTween,
    label: 'MovementTween',
    fields: [pos('fromX'), pos('fromY'), pos('startTime'), pos('durationMs')],
  },
  { type: ComponentType.Velocity, label: 'Velocity', fields: [pos('dx'), pos('dy')] },
  {
    type: ComponentType.Renderable,
    label: 'Renderable',
    fields: [str('char'), str('color'), pos('zIndex')],
  },
  {
    type: ComponentType.Behavior,
    label: 'Behavior',
    fields: [select('type', ['drift']), pos('moveChance'), bool('freezeOnDialog')],
  },
  {
    type: ComponentType.TimedEffect,
    label: 'TimedEffect',
    fields: [
      select('kind', ['explosion', 'pickupBloom', 'crumble', 'reveryCast', 'lightning', 'wildfire', 'satelliteImpact']),
      pos('startTime'),
      str('reveryId'),
    ],
  },
  { type: ComponentType.Pickupable, label: 'Pickupable', fields: [str('definitionId')] },
  { type: ComponentType.Blocking, label: 'Blocking', fields: [bool('blockMovement')] },
  { type: ComponentType.Aura, label: 'Aura', fields: [str('kind'), pos('radius')] },
  {
    type: ComponentType.ShootingStarData,
    label: 'ShootingStarData',
    fields: [pos('length'), pos('age'), bool('willLand')],
  },
  { type: ComponentType.MultiPosition, label: 'MultiPosition', fields: [] },

  { type: ComponentType.CharacterIdentity, label: 'CharacterIdentity', fields: [str('definitionId')] },
  {
    type: ComponentType.ItemDrop,
    label: 'ItemDrop',
    fields: [str('definitionId'), bool('glinting')],
  },
  { type: ComponentType.ChainSource, label: 'ChainSource', fields: [bool('fromChain')] },
  { type: ComponentType.LightningData, label: 'LightningData', fields: [] },
  { type: ComponentType.EntityTag, label: 'EntityTag', fields: [str('value')] },
  {
    type: ComponentType.EntityZone,
    label: 'EntityZone',
    fields: [select('zone', Object.values(Zone))],
  },
  { type: ComponentType.HungerTimer, label: 'HungerTimer', fields: [pos('hungerMs')] },
  {
    type: ComponentType.AngelData,
    label: 'AngelData',
    fields: [
      select('auraKind', ['rain', 'bees', 'clover']),
      pos('spawnTime'),
      bool('spokenToPlayer'),
      pos('encounterCount'),
      pos('seed'),
      pos('lastBeeSpawnTime'),
      pos('lastCloverGrowTime'),
    ],
  },
  {
    type: ComponentType.SatelliteData,
    label: 'SatelliteData',
    fields: [pos('length'), pos('age'), select('payloadType', ['destructive', 'seeds'])],
  },
  {
    type: ComponentType.MonarchState,
    label: 'MonarchState',
    fields: [select('phase', ['wandering', 'fleeing', 'settled'])],
  },
]

// --- Default values per component ---

const componentDefaults = (type: ComponentType, now: number, zone: Zone): Record<string, unknown> | string => {
  switch (type) {
    case ComponentType.Position:
      return { x: 0, y: 0 }
    case ComponentType.MovementTween:
      return { fromX: 0, fromY: 0, startTime: now, durationMs: 100 }
    case ComponentType.Velocity:
      return { dx: 0, dy: 0 }
    case ComponentType.Renderable:
      return { char: '?', color: '#ffffff', zIndex: 0 }
    case ComponentType.Behavior:
      return { type: 'drift', moveChance: 0.15, freezeOnDialog: true }
    case ComponentType.TimedEffect:
      return { kind: 'explosion', startTime: now }
    case ComponentType.Pickupable:
      return { definitionId: 'meteorite' }
    case ComponentType.Blocking:
      return { blockMovement: true }
    case ComponentType.Aura:
      return { kind: 'rain', radius: 6 }
    case ComponentType.ShootingStarData:
      return { length: 4, age: 0, willLand: false, landingTarget: null }
    case ComponentType.MultiPosition:
      return { positions: [] }

    case ComponentType.CharacterIdentity:
      return { definitionId: 'gron' }
    case ComponentType.ItemDrop:
      return { definitionId: 'coin' }
    case ComponentType.ChainSource:
      return { fromChain: false }
    case ComponentType.LightningData:
      return { path: [], branch: null }
    case ComponentType.EntityTag:
      return 'bee'
    case ComponentType.EntityZone:
      return { zone }
    case ComponentType.HungerTimer:
      return { hungerMs: 0 }
    case ComponentType.AngelData:
      return {
        auraKind: 'rain',
        spawnTime: now,
        spokenToPlayer: false,
        encounterCount: 0,
        seed: Math.floor(Math.random() * 2147483647),
        lastBeeSpawnTime: 0,
        lastCloverGrowTime: 0,
      }
    case ComponentType.MonarchState:
      return { phase: 'wandering', target: null, waypoint: null, lastPollinateTime: 0 }
    default:
      return {}
  }
}

export const getComponentDefaults = (type: ComponentType, now: number, zone: Zone): Record<string, unknown> | string =>
  componentDefaults(type, now, zone)

// --- Entity presets ---

export interface DevPreset {
  label: string
  components: {
    type: ComponentType
    overrides?: Record<string, unknown>
  }[]
}

export const DEV_PRESETS: Record<string, DevPreset> = {
  bee: {
    label: 'Bee',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.EntityTag, overrides: { value: 'bee' } },
      { type: ComponentType.EntityZone },
      { type: ComponentType.HungerTimer },
    ],
  },
  monarch: {
    label: 'Monarch Butterfly',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.EntityTag, overrides: { value: 'monarch' } },
      { type: ComponentType.EntityZone },
      { type: ComponentType.HungerTimer },
      { type: ComponentType.MonarchState },
    ],
  },
  angel: {
    label: 'Angel',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.EntityTag, overrides: { value: 'angel' } },
      { type: ComponentType.EntityZone },
      { type: ComponentType.AngelData },
      { type: ComponentType.Aura, overrides: { kind: 'rain', radius: 25 } },
    ],
  },
  'shooting-star': {
    label: 'Shooting Star',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.Velocity, overrides: { dx: -1, dy: 1 } },
      { type: ComponentType.ShootingStarData, overrides: { length: 4, age: 0, willLand: true } },
      { type: ComponentType.EntityTag, overrides: { value: 'shootingStar' } },
      { type: ComponentType.EntityZone },
    ],
  },
  meteorite: {
    label: 'Meteorite',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.Pickupable, overrides: { definitionId: 'meteorite' } },
      { type: ComponentType.EntityTag, overrides: { value: 'meteorite' } },
      { type: ComponentType.EntityZone },
    ],
  },
  ghost: {
    label: 'Ghost',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.CharacterIdentity, overrides: { definitionId: 'ghost-1' } },
      { type: ComponentType.Blocking },
      { type: ComponentType.EntityTag, overrides: { value: 'character' } },
      { type: ComponentType.EntityZone },
      { type: ComponentType.Behavior, overrides: { type: 'drift', moveChance: 0.15, freezeOnDialog: true } },
    ],
  },
  'ground-item': {
    label: 'Ground Item',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.ItemDrop, overrides: { definitionId: 'coin' } },
      { type: ComponentType.EntityTag, overrides: { value: 'groundItem' } },
      { type: ComponentType.EntityZone },
    ],
  },
  beehive: {
    label: 'Beehive',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.Blocking },
      { type: ComponentType.EntityTag, overrides: { value: 'beehive' } },
      { type: ComponentType.EntityZone },
    ],
  },
  lightning: {
    label: 'Lightning',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.TimedEffect, overrides: { kind: 'lightning' } },
      { type: ComponentType.LightningData },
      { type: ComponentType.EntityTag, overrides: { value: 'lightning' } },
      { type: ComponentType.EntityZone },
    ],
  },
  satellite: {
    label: 'Satellite',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.Velocity, overrides: { dx: 1, dy: 1 } },
      { type: ComponentType.SatelliteData, overrides: { length: 10, age: 0, payloadType: 'destructive' } },
      { type: ComponentType.EntityTag, overrides: { value: 'satellite' } },
      { type: ComponentType.EntityZone },
    ],
  },
  explosion: {
    label: 'Explosion',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.TimedEffect, overrides: { kind: 'explosion' } },
      { type: ComponentType.EntityTag, overrides: { value: 'explosion' } },
      { type: ComponentType.EntityZone },
    ],
  },
  wildfire: {
    label: 'Wildfire',
    components: [
      { type: ComponentType.MultiPosition },
      { type: ComponentType.TimedEffect, overrides: { kind: 'wildfire' } },
      { type: ComponentType.EntityTag, overrides: { value: 'wildfire' } },
      { type: ComponentType.EntityZone },
    ],
  },
}

// --- Spawn helper ---

export const spawnDevEntity = (
  state: GameState,
  checkedComponents: Map<ComponentType, Record<string, unknown>>,
  position: Position
): void => {
  const now = performance.now()
  const e = state.world.createEntity()

  for (const [type, values] of checkedComponents) {
    const defaults = getComponentDefaults(type, now, state.currentZone)

    if (type === ComponentType.Position) {
      state.world.addComponent(e, ComponentType.Position, { x: position.x, y: position.y })
      continue
    }

    if (type === ComponentType.EntityTag) {
      const tagValue = (values.value as string | undefined) ?? (defaults as string) ?? 'unknown'
      state.world.addComponent(e, ComponentType.EntityTag, typeof tagValue === 'string' ? tagValue : 'unknown')
      continue
    }

    if (type === ComponentType.EntityZone) {
      const zoneOverride = values.zone as string | undefined
      if (zoneOverride !== undefined) {
        const ruinIndexOverride = values.ruinIndex as number | undefined
        state.world.addComponent(e, ComponentType.EntityZone, {
          zone: zoneOverride as Zone,
          ruinIndex: ruinIndexOverride,
        })
      } else {
        state.world.addComponent(e, ComponentType.EntityZone, getCurrentEntityZone(state))
      }
      continue
    }

    // SatelliteData: drop position becomes the landing target, satellite starts off-screen
    if (type === ComponentType.SatelliteData) {
      const length =
        SATELLITE_MIN_LENGTH + Math.floor(Math.random() * (SATELLITE_MAX_LENGTH - SATELLITE_MIN_LENGTH + 1))
      const payloadType = (values.payloadType as string) ?? 'destructive'
      state.world.addComponent(e, ComponentType.SatelliteData, {
        length,
        age: 0,
        landingTarget: { x: position.x, y: position.y },
        payloadType: payloadType as 'destructive' | 'seeds',
      })
      // Override position: trace backward from target to map edge
      const vel = state.world.getComponent(e, ComponentType.Velocity)
      const dx = vel?.dx ?? 1
      const dy = vel?.dy ?? 1
      let sx = position.x
      let sy = position.y
      while (sx >= 0 && sx < MAP_WIDTH && sy >= 0 && sy < MAP_HEIGHT) {
        sx -= dx
        sy -= dy
      }
      state.world.moveEntity(e, sx, sy)
      continue
    }

    // LightningData: generate a real bolt path from the drop position
    if (type === ComponentType.LightningData) {
      const length =
        LIGHTNING_BOLT_MIN_LENGTH +
        Math.floor(Math.random() * (LIGHTNING_BOLT_MAX_LENGTH - LIGHTNING_BOLT_MIN_LENGTH + 1))
      const { path, branch } = generateBoltPath(position.x, position.y, length, Math.random)
      state.world.addComponent(e, ComponentType.LightningData, { path, branch })
      continue
    }

    // For all other components, merge defaults with overrides
    const merged = typeof defaults === 'object' && defaults !== null ? { ...defaults, ...values } : values
    state.world.addComponent(e, type, merged as ComponentDataMap[typeof type])
  }
}

// --- Tile painting ---

export const TILE_TYPE_LIST = Object.entries(TileType).map(([label, value]) => ({
  label,
  value,
}))

export const paintTile = (state: GameState, x: number, y: number, tileType: string): void => {
  if (y < 0 || y >= state.mapHeight || x < 0 || x >= state.mapWidth) return
  setMapTile(state, x, y, { type: tileType as (typeof TileType)[keyof typeof TileType] })
}

export const paintRect = (state: GameState, x1: number, y1: number, x2: number, y2: number, tileType: string): void => {
  const minX = Math.max(0, Math.min(x1, x2))
  const maxX = Math.min(state.mapWidth - 1, Math.max(x1, x2))
  const minY = Math.max(0, Math.min(y1, y2))
  const maxY = Math.min(state.mapHeight - 1, Math.max(y1, y2))
  const tt = tileType as (typeof TileType)[keyof typeof TileType]
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      setMapTile(state, x, y, { type: tt })
    }
  }
}

// --- Entity preview glyph lookup ---

const ENTITY_TAG_GLYPHS: Record<string, { char: string; color: string }> = {
  bee: { char: BEE_CHAR, color: BEE_COLOR },
  beehive: { char: BEEHIVE_CHAR, color: BEEHIVE_COLOR },
  character: { char: GHOST_CHAR, color: GHOST_COLOR },
  meteorite: { char: METEORITE_CHAR, color: METEORITE_COLOR },
  monarch: { char: MONARCH_CHAR, color: MONARCH_COLOR },
  angel: { char: 'A', color: '#FFFFFF' },
  shootingStar: { char: '*', color: '#FFFFFF' },
  explosion: { char: '*', color: '#FFD700' },
  lightning: { char: '|', color: LIGHTNING_BOLT_COLOR_BRIGHT },
  wildfire: { char: '^', color: '#FF4500' },
  reveryCast: { char: '~', color: '#4466aa' },
  crumble: { char: '#', color: '#997755' },
  pickupBloom: { char: '*', color: '#FFE4B5' },
}

export const getEntityPreviewGlyph = (
  checkedComponents: Map<ComponentType, Record<string, unknown>>
): { char: string; color: string } => {
  // Check Renderable first (explicit char/color)
  const renderable = checkedComponents.get(ComponentType.Renderable)
  if (renderable) {
    return {
      char: typeof renderable.char === 'string' ? renderable.char : '?',
      color: typeof renderable.color === 'string' ? renderable.color : '#ffffff',
    }
  }

  // Derive from EntityTag
  const tagValues = checkedComponents.get(ComponentType.EntityTag)
  const tag = typeof tagValues?.value === 'string' ? tagValues.value : null
  if (tag) {
    const known = ENTITY_TAG_GLYPHS[tag]
    if (known) return known

    // Ground items use the item definition glyph
    if (tag === 'groundItem') {
      const itemDrop = checkedComponents.get(ComponentType.ItemDrop)
      const defId = typeof itemDrop?.definitionId === 'string' ? itemDrop.definitionId : null
      if (defId) {
        try {
          const def = getDefinition(defId)
          return { char: def.glyph, color: def.glyphColor }
        } catch {
          // Unknown item
        }
      }
    }
  }

  return { char: '?', color: '#ff69b4' }
}

// --- Ruin preset (non-ECS, drag-to-place spawns a ruin entrance + interior) ---

export const RUIN_PRESET_KEY = 'ruin'
export const RUIN_PRESET_LABEL = 'Ruin'

export const RUIN_GLYPH_RANDOM = 'random'

export const RUIN_ARCHETYPE_OPTIONS: readonly { value: RuinArchetype; label: string }[] = [
  { value: RuinArchetype.DormantGarden, label: 'dormant garden' },
]

export const RUIN_GLYPH_OPTIONS: readonly string[] = [RUIN_GLYPH_RANDOM, ...ENTRANCE_GLYPHS]

export const RUIN_ENTRANCE_COLOR = '#cccccc'

const RUIN_PREVIEW_GLYPH_FALLBACK = ENTRANCE_GLYPHS[0]

export const getRuinPreviewGlyph = (glyph: string): { char: string; color: string } => {
  const char = glyph === RUIN_GLYPH_RANDOM ? RUIN_PREVIEW_GLYPH_FALLBACK : glyph
  return { char, color: RUIN_ENTRANCE_COLOR }
}

const isValidRuinDropTile = (state: GameState, x: number, y: number): boolean => {
  if (state.currentZone !== Zone.Overworld) return false
  if (x < 0 || x >= state.mapWidth || y < 0 || y >= state.mapHeight) return false
  const tile = state.map[y][x]
  if (tile.type === TileType.Space) return false
  if (tile.type === TileType.RuinEntrance) return false
  if (tile.type === TileType.CaveEntrance) return false
  const key = posKey(x, y)
  if (state.ponds.has(key) || state.rivers.has(key)) return false
  return true
}

const buildPlaceholderRuin = (position: Position, ruinIndex: number): CivilizationRuin => ({
  position,
  name: `dev-ruin-${String(ruinIndex)}`,
  radius: 4,
  age: 1500,
  aqueductPaths: [],
  buildingFootprints: [],
})

export const spawnDevRuin = (
  state: GameState,
  position: Position,
  archetype: RuinArchetype,
  glyph: string
): boolean => {
  if (!isValidRuinDropTile(state, position.x, position.y)) return false

  const ruinIndex = state.ruinInteriors.length
  const ruin = buildPlaceholderRuin(position, ruinIndex)
  const interior = generateRuinInterior(ruin, ruinIndex, archetype, Math.random)

  const resolvedGlyph =
    glyph === RUIN_GLYPH_RANDOM ? ENTRANCE_GLYPHS[Math.floor(Math.random() * ENTRANCE_GLYPHS.length)] : glyph

  state.ruinInteriors.push({
    ...interior,
    entranceOverworld: { x: position.x, y: position.y },
    glyph: resolvedGlyph,
  })

  setMapTile(state, position.x, position.y, { type: TileType.RuinEntrance })
  return true
}
