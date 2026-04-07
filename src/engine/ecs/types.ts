import type { CharacterBehavior, Position, Zone } from '../types'

export type Entity = number

export const ComponentType = {
  Position: 'position',
  Velocity: 'velocity',
  Renderable: 'renderable',
  Behavior: 'behavior',
  TimedEffect: 'timedEffect',
  Pickupable: 'pickupable',
  Blocking: 'blocking',
  Aura: 'aura',
  ShootingStarData: 'shootingStarData',
  MultiPosition: 'multiPosition',
  OmniboxLink: 'omniboxLink',
  CharacterIdentity: 'characterIdentity',
  ItemDrop: 'itemDrop',
  ChainSource: 'chainSource',
  EntityTag: 'entityTag',
  EntityZone: 'entityZone',
} as const

export type ComponentType = (typeof ComponentType)[keyof typeof ComponentType]

export interface ComponentDataMap {
  [ComponentType.Position]: { x: number; y: number }
  [ComponentType.Velocity]: { dx: number; dy: number }
  [ComponentType.Renderable]: { char: string; color: string; zIndex: number }
  [ComponentType.Behavior]: CharacterBehavior
  [ComponentType.TimedEffect]: {
    kind: 'explosion' | 'pickupBloom' | 'crumble'
    startTime: number
  }
  [ComponentType.Pickupable]: { definitionId: string }
  [ComponentType.Blocking]: { blockMovement: boolean }
  [ComponentType.Aura]: { kind: string; radius: number }
  [ComponentType.ShootingStarData]: {
    length: number
    age: number
    willLand: boolean
    landingTarget: Position | null
  }
  [ComponentType.MultiPosition]: { positions: Position[] }
  [ComponentType.OmniboxLink]: { uid: string }
  [ComponentType.CharacterIdentity]: { definitionId: string }
  [ComponentType.ItemDrop]: { definitionId: string; glinting?: boolean }
  [ComponentType.ChainSource]: { fromChain: boolean }
  [ComponentType.EntityTag]: string
  [ComponentType.EntityZone]: { zone: Zone }
}
