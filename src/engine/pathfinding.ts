import { CARDINAL, isInBounds, posKey } from './position'
import { TileType } from './types'

import type { Position, Tile } from './types'

// Binary min-heap keyed on f-score
interface HeapNode {
  index: number
  f: number
}

const heapPush = (heap: HeapNode[], node: HeapNode): void => {
  heap.push(node)
  let i = heap.length - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (heap[parent].f <= heap[i].f) break
    ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
    i = parent
  }
}

const heapPop = (heap: HeapNode[]): HeapNode | undefined => {
  if (heap.length === 0) return undefined
  const top = heap[0]
  const last = heap.pop()
  if (last === undefined) return top
  if (heap.length > 0) {
    heap[0] = last
    let i = 0
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < heap.length && heap[left].f < heap[smallest].f) smallest = left
      if (right < heap.length && heap[right].f < heap[smallest].f) smallest = right
      if (smallest === i) break
      ;[heap[i], heap[smallest]] = [heap[smallest], heap[i]]
      i = smallest
    }
  }
  return top
}

export const findPath = (
  map: Tile[][],
  mapWidth: number,
  mapHeight: number,
  from: Position,
  to: Position,
  blockedPositions?: Set<string>
): Position[] | null => {
  // Reject out-of-bounds or unwalkable destination
  if (!isInBounds(to.x, to.y, mapWidth, mapHeight)) return null
  if (map[to.y][to.x].type === TileType.Space) return null
  if (blockedPositions?.has(posKey(to.x, to.y))) return null

  // Same position — no path needed
  if (from.x === to.x && from.y === to.y) return null

  const size = mapWidth * mapHeight
  const toIndex = (p: Position): number => p.y * mapWidth + p.x
  const manhattan = (a: Position, b: Position): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

  const fromIdx = toIndex(from)
  const toIdx = toIndex(to)

  const gScore = new Float64Array(size)
  gScore.fill(Infinity)
  gScore[fromIdx] = 0

  const cameFrom = new Int32Array(size)
  cameFrom.fill(-1)

  const visited = new Uint8Array(size)

  const open: HeapNode[] = []
  heapPush(open, { index: fromIdx, f: manhattan(from, to) })

  while (open.length > 0) {
    const current = heapPop(open)
    if (!current) break
    if (current.index === toIdx) {
      // Reconstruct path
      const path: Position[] = []
      let idx = toIdx
      while (idx !== fromIdx) {
        path.push({ x: idx % mapWidth, y: Math.floor(idx / mapWidth) })
        idx = cameFrom[idx]
      }
      path.reverse()
      return path
    }

    if (visited[current.index]) continue
    visited[current.index] = 1

    const cx = current.index % mapWidth
    const cy = Math.floor(current.index / mapWidth)

    for (const d of CARDINAL) {
      const nx = cx + d.x
      const ny = cy + d.y
      if (!isInBounds(nx, ny, mapWidth, mapHeight)) continue
      if (map[ny][nx].type === TileType.Space) continue
      if (blockedPositions?.has(posKey(nx, ny))) continue

      const nIdx = ny * mapWidth + nx
      if (visited[nIdx]) continue

      const tentativeG = gScore[current.index] + 1
      if (tentativeG < gScore[nIdx]) {
        gScore[nIdx] = tentativeG
        cameFrom[nIdx] = current.index
        const neighbor = { x: nx, y: ny }
        heapPush(open, { index: nIdx, f: tentativeG + manhattan(neighbor, to) })
      }
    }
  }

  return null
}
