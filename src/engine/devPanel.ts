import { ComponentType } from './ecs/types'
import { TileType, Zone } from './types'

import type { ComponentDataMap } from './ecs/types'
import type { GameState, Position } from './types'

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
  { type: ComponentType.Velocity, label: 'Velocity', fields: [pos('dx'), pos('dy')] },
  {
    type: ComponentType.Renderable,
    label: 'Renderable',
    fields: [str('char'), str('color'), pos('zIndex')],
  },
  {
    type: ComponentType.Behavior,
    label: 'Behavior',
    fields: [
      select('type', ['drift']),
      pos('moveChance'),
      bool('freezeOnDialog'),
    ],
  },
  {
    type: ComponentType.TimedEffect,
    label: 'TimedEffect',
    fields: [
      select('kind', ['explosion', 'pickupBloom', 'crumble', 'reveryCast', 'lightning', 'wildfire']),
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
  { type: ComponentType.OmniboxLink, label: 'OmniboxLink', fields: [str('uid')] },
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
]

// --- Default values per component ---

const componentDefaults = (type: ComponentType, now: number, zone: Zone): Record<string, unknown> | string => {
  switch (type) {
    case ComponentType.Position:
      return { x: 0, y: 0 }
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
    case ComponentType.OmniboxLink:
      return { uid: crypto.randomUUID() }
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
  'ground-omnibox': {
    label: 'Ground Omnibox',
    components: [
      { type: ComponentType.Position },
      { type: ComponentType.OmniboxLink },
      { type: ComponentType.Blocking },
      { type: ComponentType.EntityTag, overrides: { value: 'groundOmnibox' } },
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
      const tagValue = (values.value as string | undefined) ??
        (defaults as string) ??
        'unknown'
      state.world.addComponent(e, ComponentType.EntityTag, typeof tagValue === 'string' ? tagValue : 'unknown')
      continue
    }

    if (type === ComponentType.EntityZone) {
      const zone = (values.zone as string | undefined) ?? state.currentZone
      state.world.addComponent(e, ComponentType.EntityZone, { zone: zone as Zone })
      continue
    }

    // For all other components, merge defaults with overrides
    const merged = typeof defaults === 'object' && defaults !== null
      ? { ...defaults, ...values }
      : values
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
  state.map[y][x] = { type: tileType as typeof TileType[keyof typeof TileType] }
}
