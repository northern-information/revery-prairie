import { posKey } from '../position'

import type { Entity } from './types'

export interface SpatialIndex {
  insert: (entity: Entity, x: number, y: number) => void
  remove: (entity: Entity, x: number, y: number) => void
  move: (entity: Entity, fromX: number, fromY: number, toX: number, toY: number) => void
  at: (x: number, y: number) => Entity[]
  inRadius: (cx: number, cy: number, r: number) => Entity[]
  inRect: (x: number, y: number, w: number, h: number) => Entity[]
  clear: () => void
}

export const createSpatialIndex = (): SpatialIndex => {
  const cells = new Map<string, Set<Entity>>()

  const insert = (entity: Entity, x: number, y: number): void => {
    const key = posKey(x, y)
    let set = cells.get(key)
    if (!set) {
      set = new Set()
      cells.set(key, set)
    }
    set.add(entity)
  }

  const remove = (entity: Entity, x: number, y: number): void => {
    const key = posKey(x, y)
    const set = cells.get(key)
    if (set) {
      set.delete(entity)
      if (set.size === 0) cells.delete(key)
    }
  }

  const move = (entity: Entity, fromX: number, fromY: number, toX: number, toY: number): void => {
    remove(entity, fromX, fromY)
    insert(entity, toX, toY)
  }

  const at = (x: number, y: number): Entity[] => {
    const set = cells.get(posKey(x, y))
    return set ? [...set] : []
  }

  const inRadius = (cx: number, cy: number, r: number): Entity[] => {
    const result: Entity[] = []
    const r2 = r * r
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue
        const set = cells.get(posKey(cx + dx, cy + dy))
        if (set) {
          for (const e of set) result.push(e)
        }
      }
    }
    return result
  }

  const inRect = (x: number, y: number, w: number, h: number): Entity[] => {
    const result: Entity[] = []
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const set = cells.get(posKey(x + dx, y + dy))
        if (set) {
          for (const e of set) result.push(e)
        }
      }
    }
    return result
  }

  const clear = (): void => {
    cells.clear()
  }

  return { insert, remove, move, at, inRadius, inRect, clear }
}
