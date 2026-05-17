import type { Container, GameState, ItemInstance } from './types'

export const getActiveContainers = (state: GameState): Container[] =>
  state.openContainer ? [state.backpack, state.openContainer] : [state.backpack]

export const buildOccupancyGrid = (container: Container, excludeUid?: string): (string | null)[][] => {
  const grid: (string | null)[][] = []
  for (let y = 0; y < container.height; y++) {
    grid.push(new Array<string | null>(container.width).fill(null))
  }
  for (const item of container.items) {
    if (item.uid === excludeUid) continue
    const row = grid[item.gridY]
    if (row && item.gridY >= 0 && item.gridY < container.height && item.gridX >= 0 && item.gridX < container.width) {
      row[item.gridX] = item.uid
    }
  }
  return grid
}

export const canPlace = (
  container: Container,
  _definitionId: string,
  gridX: number,
  gridY: number,
  excludeUid?: string
): boolean => {
  if (gridX < 0 || gridY < 0 || gridX >= container.width || gridY >= container.height) {
    return false
  }

  const occupancy = buildOccupancyGrid(container, excludeUid)
  return occupancy[gridY]?.[gridX] === null
}

export const placeItem = (
  container: Container,
  definitionId: string,
  gridX: number,
  gridY: number
): ItemInstance | null => {
  if (!canPlace(container, definitionId, gridX, gridY)) {
    return null
  }

  const instance: ItemInstance = {
    uid: crypto.randomUUID(),
    definitionId,
    gridX,
    gridY,
  }

  container.items.push(instance)
  return instance
}

export const removeItem = (container: Container, uid: string): ItemInstance | null => {
  const idx = container.items.findIndex(i => i.uid === uid)
  if (idx === -1) return null
  return container.items.splice(idx, 1)[0] ?? null
}

export const moveItem = (container: Container, uid: string, newGridX: number, newGridY: number): boolean => {
  const item = container.items.find(i => i.uid === uid)
  if (!item) return false

  if (!canPlace(container, item.definitionId, newGridX, newGridY, uid)) {
    return false
  }

  item.gridX = newGridX
  item.gridY = newGridY
  return true
}

export const findFitPosition = (
  container: Container,
  _definitionId: string
): { gridX: number; gridY: number } | null => {
  for (let y = 0; y < container.height; y++) {
    for (let x = 0; x < container.width; x++) {
      if (canPlace(container, '', x, y)) {
        return { gridX: x, gridY: y }
      }
    }
  }

  return null
}

export const autoSort = (container: Container): boolean => {
  const items = [...container.items]
  container.items = []

  const sorted = [...items].sort((a, b) => {
    if (a.definitionId !== b.definitionId) {
      return a.definitionId < b.definitionId ? -1 : 1
    }
    return 0
  })

  for (const item of sorted) {
    const pos = findFitPosition(container, item.definitionId)
    if (!pos) {
      container.items = items
      return false
    }
    // Re-place the original item at the new position, preserving its uid
    item.gridX = pos.gridX
    item.gridY = pos.gridY
    container.items.push(item)
  }

  return true
}

export const transferItem = (
  source: Container,
  target: Container,
  uid: string,
  gridX: number,
  gridY: number
): boolean => {
  const item = source.items.find(i => i.uid === uid)
  if (!item) return false

  if (!canPlace(target, item.definitionId, gridX, gridY)) {
    return false
  }

  const removed = removeItem(source, uid)
  if (!removed) return false

  // Mutate the original item in place to preserve uid (same pattern as autoSort).
  // glintingCoins are keyed by uid — generating a new one orphans them.
  item.gridX = gridX
  item.gridY = gridY
  target.items.push(item)

  return true
}

export const containerHasItem = (container: Container, definitionId: string): boolean =>
  container.items.some(i => i.definitionId === definitionId)

export const findItemByDefinition = (container: Container, definitionId: string): ItemInstance | undefined =>
  container.items.find(i => i.definitionId === definitionId)
