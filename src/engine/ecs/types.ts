import type { FloraGenome, TraitBag } from '../genetics'
import type { CharacterBehavior, MovementTween, PollenLoad, Position, Zone } from '../types'

export type Entity = number

export const ComponentType = {
  Position: 'position',
  MovementTween: 'movementTween',
  Velocity: 'velocity',
  Renderable: 'renderable',
  Behavior: 'behavior',
  TimedEffect: 'timedEffect',
  Pickupable: 'pickupable',
  Blocking: 'blocking',
  Aura: 'aura',
  MusicEmitter: 'musicEmitter',
  ShootingStarData: 'shootingStarData',
  MultiPosition: 'multiPosition',

  CharacterIdentity: 'characterIdentity',
  ItemDrop: 'itemDrop',
  LightningData: 'lightningData',
  EntityTag: 'entityTag',
  EntityZone: 'entityZone',
  HungerTimer: 'hungerTimer',
  AngelData: 'angelData',
  OakData: 'oakData',
  SatelliteData: 'satelliteData',
  MonarchState: 'monarchState',
  PickupExemption: 'pickupExemption',
  // Precis #17 — pollen carried by a bee or monarch. Cross-species
  // mixing is allowed in the bag. Bag is emptied when the entity
  // enters Chebyshev-1 of any beehive. See src/engine/pollination.ts.
  PollenBag: 'pollenBag',
} as const

export type ComponentType = (typeof ComponentType)[keyof typeof ComponentType]

export interface ComponentDataMap {
  [ComponentType.Position]: { x: number; y: number }
  [ComponentType.MovementTween]: MovementTween
  [ComponentType.Velocity]: { dx: number; dy: number }
  [ComponentType.Renderable]: { char: string; color: string; zIndex: number }
  [ComponentType.Behavior]: CharacterBehavior
  [ComponentType.TimedEffect]: {
    kind:
      | 'explosion'
      | 'pickupBloom'
      | 'crumble'
      | 'lightning'
      | 'wildfire'
      | 'satelliteImpact'
      | 'stewardImpact'
      | 'pollenBurst'
    startTime: number
  }
  [ComponentType.Pickupable]: { definitionId: string }
  [ComponentType.Blocking]: { blockMovement: boolean }
  [ComponentType.Aura]: { kind: string; radius: number }
  [ComponentType.MusicEmitter]: { url: string; radius: number }
  [ComponentType.ShootingStarData]: {
    length: number
    age: number
    willLand: boolean
    landingTarget: Position | null
    forPlayerSpawn?: boolean
  }
  [ComponentType.MultiPosition]: { positions: Position[] }

  [ComponentType.CharacterIdentity]: { definitionId: string }
  [ComponentType.ItemDrop]: { definitionId: string; glinting?: boolean; genome?: FloraGenome }
  [ComponentType.LightningData]: {
    path: { x: number; y: number }[]
    branch: { x: number; y: number }[] | null
  }
  [ComponentType.EntityTag]: string
  [ComponentType.EntityZone]: { zone: Zone; ruinIndex?: number }
  [ComponentType.HungerTimer]: { hungerMs: number }
  [ComponentType.AngelData]: {
    auraKind: 'rain' | 'bees' | 'clover'
    spawnTime: number
    cantoStored: boolean
    encounterCount: number
    seed: number
    lastBeeSpawnTime: number
    lastCloverGrowTime: number
  }
  [ComponentType.OakData]: {
    plantedTime: number
    identity: string
    traits: TraitBag
  }
  [ComponentType.SatelliteData]: {
    length: number
    age: number
    landingTarget: Position
    payloadType: 'destructive' | 'seeds'
  }
  [ComponentType.MonarchState]: {
    phase: 'wandering' | 'fleeing' | 'settled'
    target: Position | null
    waypoint: Position | null
    lastPollinateTime: number
  }
  [ComponentType.PickupExemption]: Record<string, never>
  [ComponentType.PollenBag]: { loads: PollenLoad[] }
}
