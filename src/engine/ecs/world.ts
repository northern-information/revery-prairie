import { createSpatialIndex } from './spatial'
import { ComponentType } from './types'

import type { SpatialIndex } from './spatial'
import type { ComponentDataMap, Entity } from './types'

export interface World {
  createEntity: () => Entity
  destroyEntity: (entity: Entity) => void
  isAlive: (entity: Entity) => boolean
  addComponent: <K extends ComponentType>(
    entity: Entity,
    type: K,
    data: ComponentDataMap[K],
  ) => void
  removeComponent: (entity: Entity, type: ComponentType) => void
  getComponent: <K extends ComponentType>(
    entity: Entity,
    type: K,
  ) => ComponentDataMap[K] | undefined
  hasComponent: (entity: Entity, type: ComponentType) => boolean
  query: (...types: ComponentType[]) => Entity[]
  moveEntity: (entity: Entity, newX: number, newY: number) => void
  readonly spatial: SpatialIndex
}

export const createWorld = (): World => {
  let nextId = 1
  const alive = new Set<Entity>()
  const stores = new Map<ComponentType, Map<Entity, unknown>>()
  const spatial = createSpatialIndex()

  const getStore = (type: ComponentType): Map<Entity, unknown> => {
    let store = stores.get(type)
    if (!store) {
      store = new Map()
      stores.set(type, store)
    }
    return store
  }

  const createEntity = (): Entity => {
    const id = nextId++
    alive.add(id)
    return id
  }

  const destroyEntity = (entity: Entity): void => {
    if (!alive.has(entity)) return
    // Clean up spatial index if entity has a position
    const posStore = stores.get(ComponentType.Position)
    if (posStore) {
      const pos = posStore.get(entity) as
        | ComponentDataMap[typeof ComponentType.Position]
        | undefined
      if (pos) {
        spatial.remove(entity, pos.x, pos.y)
      }
    }
    // Remove from all component stores
    for (const store of stores.values()) {
      store.delete(entity)
    }
    alive.delete(entity)
  }

  const isAlive = (entity: Entity): boolean => alive.has(entity)

  const addComponent = <K extends ComponentType>(
    entity: Entity,
    type: K,
    data: ComponentDataMap[K],
  ): void => {
    if (!alive.has(entity)) return
    const store = getStore(type)

    // If replacing an existing position, remove old from spatial
    if (type === ComponentType.Position) {
      const existing = store.get(entity) as
        | ComponentDataMap[typeof ComponentType.Position]
        | undefined
      if (existing) {
        spatial.remove(entity, existing.x, existing.y)
      }
      const pos = data as ComponentDataMap[typeof ComponentType.Position]
      spatial.insert(entity, pos.x, pos.y)
    }

    store.set(entity, data)
  }

  const removeComponent = (entity: Entity, type: ComponentType): void => {
    const store = stores.get(type)
    if (!store) return

    if (type === ComponentType.Position) {
      const pos = store.get(entity) as
        | ComponentDataMap[typeof ComponentType.Position]
        | undefined
      if (pos) {
        spatial.remove(entity, pos.x, pos.y)
      }
    }

    store.delete(entity)
  }

  const getComponent = <K extends ComponentType>(
    entity: Entity,
    type: K,
  ): ComponentDataMap[K] | undefined => {
    const store = stores.get(type)
    if (!store) return undefined
    return store.get(entity) as ComponentDataMap[K] | undefined
  }

  const hasComponent = (entity: Entity, type: ComponentType): boolean => {
    const store = stores.get(type)
    if (!store) return false
    return store.has(entity)
  }

  const query = (...types: ComponentType[]): Entity[] => {
    if (types.length === 0) return [...alive]

    // Find the smallest store to iterate
    let smallest: Map<Entity, unknown> | undefined
    let smallestSize = Infinity
    for (const type of types) {
      const store = stores.get(type)
      if (!store || store.size === 0) return []
      if (store.size < smallestSize) {
        smallest = store
        smallestSize = store.size
      }
    }
    if (!smallest) return []

    const result: Entity[] = []
    for (const entity of smallest.keys()) {
      if (!alive.has(entity)) continue
      let match = true
      for (const type of types) {
        const store = stores.get(type)
        if (!store?.has(entity)) {
          match = false
          break
        }
      }
      if (match) result.push(entity)
    }
    return result
  }

  const moveEntity = (entity: Entity, newX: number, newY: number): void => {
    const store = stores.get(ComponentType.Position)
    if (!store) return
    const pos = store.get(entity) as
      | ComponentDataMap[typeof ComponentType.Position]
      | undefined
    if (!pos) return
    spatial.move(entity, pos.x, pos.y, newX, newY)
    pos.x = newX
    pos.y = newY
  }

  return {
    createEntity,
    destroyEntity,
    isAlive,
    addComponent,
    removeComponent,
    getComponent,
    hasComponent,
    query,
    moveEntity,
    spatial,
  }
}
