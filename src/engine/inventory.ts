import { OMNIBOX_HEIGHT, OMNIBOX_WIDTH } from './constants'
import { getDefinition } from './items'
import { Rotation } from './types'

import type { Container, GameState, ItemInstance } from './types'

export const getActiveContainers = (state: GameState): Container[] => [state.backpack, ...state.openContainers]

export const rotateShapeCW = (shape: boolean[][]): boolean[][] => {
  const rows = shape.length
  const cols = shape[0]?.length ?? 0
  const result: boolean[][] = []
  for (let c = 0; c < cols; c++) {
    const row: boolean[] = []
    for (let r = rows - 1; r >= 0; r--) {
      row.push(shape[r]?.[c] ?? false)
    }
    result.push(row)
  }
  return result
}

export const getRotatedShape = (shape: boolean[][], rotation: Rotation): boolean[][] => {
  let result = shape
  for (let i = 0; i < rotation; i++) {
    result = rotateShapeCW(result)
  }
  return result
}

export const shapeWidth = (shape: boolean[][]): number => shape[0]?.length ?? 0

export const shapeHeight = (shape: boolean[][]): number => shape.length

export const buildOccupancyGrid = (container: Container, excludeUid?: string): (string | null)[][] => {
  const grid: (string | null)[][] = []
  for (let y = 0; y < container.height; y++) {
    grid.push(new Array<string | null>(container.width).fill(null))
  }
  for (const item of container.items) {
    if (item.uid === excludeUid) continue
    const def = getDefinition(item.definitionId)
    const shape = getRotatedShape(def.shape, item.rotation)
    for (let sy = 0; sy < shape.length; sy++) {
      for (let sx = 0; sx < (shape[sy]?.length ?? 0); sx++) {
        if (shape[sy]?.[sx]) {
          const gx = item.gridX + sx
          const gy = item.gridY + sy
          const row = grid[gy]
          if (row && gy >= 0 && gy < container.height && gx >= 0 && gx < container.width) {
            row[gx] = item.uid
          }
        }
      }
    }
  }
  return grid
}

export const canPlace = (
  container: Container,
  definitionId: string,
  rotation: Rotation,
  gridX: number,
  gridY: number,
  excludeUid?: string
): boolean => {
  const def = getDefinition(definitionId)
  const shape = getRotatedShape(def.shape, rotation)
  const sw = shapeWidth(shape)
  const sh = shapeHeight(shape)

  if (gridX < 0 || gridY < 0 || gridX + sw > container.width || gridY + sh > container.height) {
    return false
  }

  const occupancy = buildOccupancyGrid(container, excludeUid)

  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      if (shape[sy]?.[sx] && occupancy[gridY + sy]?.[gridX + sx] !== null) {
        return false
      }
    }
  }

  return true
}

export const placeItem = (
  container: Container,
  definitionId: string,
  rotation: Rotation,
  gridX: number,
  gridY: number
): ItemInstance | null => {
  if (!canPlace(container, definitionId, rotation, gridX, gridY)) {
    return null
  }

  const instance: ItemInstance = {
    uid: crypto.randomUUID(),
    definitionId,
    rotation,
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

export const moveItem = (
  container: Container,
  uid: string,
  newGridX: number,
  newGridY: number,
  newRotation: Rotation
): boolean => {
  const item = container.items.find(i => i.uid === uid)
  if (!item) return false

  if (!canPlace(container, item.definitionId, newRotation, newGridX, newGridY, uid)) {
    return false
  }

  item.gridX = newGridX
  item.gridY = newGridY
  item.rotation = newRotation
  return true
}

export const findFitPosition = (
  container: Container,
  definitionId: string
): { gridX: number; gridY: number; rotation: Rotation } | null => {
  const rotations = [Rotation.R0, Rotation.R90, Rotation.R180, Rotation.R270]

  for (const rotation of rotations) {
    const def = getDefinition(definitionId)
    const shape = getRotatedShape(def.shape, rotation)
    const sw = shapeWidth(shape)
    const sh = shapeHeight(shape)

    for (let y = 0; y <= container.height - sh; y++) {
      for (let x = 0; x <= container.width - sw; x++) {
        if (canPlace(container, definitionId, rotation, x, y)) {
          return { gridX: x, gridY: y, rotation }
        }
      }
    }
  }

  return null
}

export const autoSort = (container: Container): boolean => {
  const items = [...container.items]
  container.items = []

  const sorted = items
    .map(item => {
      const def = getDefinition(item.definitionId)
      const shape = getRotatedShape(def.shape, Rotation.R0)
      const area = shape.flat().filter(Boolean).length
      return { item, area, definitionId: item.definitionId }
    })
    .sort((a, b) => {
      // Largest items first to avoid fragmentation, then group same types together
      if (a.area !== b.area) return b.area - a.area
      if (a.definitionId !== b.definitionId) {
        return a.definitionId < b.definitionId ? -1 : 1
      }
      return 0
    })

  for (const { item } of sorted) {
    const pos = findFitPosition(container, item.definitionId)
    if (!pos) {
      container.items = items
      return false
    }
    placeItem(container, item.definitionId, pos.rotation, pos.gridX, pos.gridY)
  }

  return true
}

export const transferItem = (
  source: Container,
  target: Container,
  uid: string,
  gridX: number,
  gridY: number,
  rotation: Rotation
): boolean => {
  const item = source.items.find(i => i.uid === uid)
  if (!item) return false

  const originalGridX = item.gridX
  const originalGridY = item.gridY
  const originalRotation = item.rotation

  const removed = removeItem(source, uid)
  if (!removed) return false

  const placed = placeItem(target, item.definitionId, rotation, gridX, gridY)
  if (!placed) {
    placeItem(source, item.definitionId, originalRotation, originalGridX, originalGridY)
    return false
  }

  return true
}

export const containerHasItem = (container: Container, definitionId: string): boolean =>
  container.items.some(i => i.definitionId === definitionId)

export const createOmniboxContainer = (state: GameState, uid: string): Container => {
  const num = state.nextOmniboxNumber++
  const container: Container = {
    id: uid,
    name: `omnibox #${String(num)}`,
    width: OMNIBOX_WIDTH,
    height: OMNIBOX_HEIGHT,
    items: [],
  }
  state.omniboxContainers.set(uid, container)
  return container
}

export const findItemByDefinition = (container: Container, definitionId: string): ItemInstance | undefined =>
  container.items.find(i => i.definitionId === definitionId)
