import { useCallback, useRef } from 'react'

import { INVENTORY_CELL_SIZE } from '@/engine/constants'
import { buildOccupancyGrid, getRotatedShape } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { combineIcon } from '@/engine/recipes'
import type { ItemInfoHandle } from './ItemInfo'
import type { Container } from '@/engine/types'
import type { DragState } from '@/hooks/useInventoryDrag'

interface InventoryGridProps {
  container: Container
  containerId: string
  dragState: DragState | null
  onStartDrag: (uid: string, containerId: string) => void
  onUpdateGhost: (gridX: number, gridY: number, containerId: string) => void
  onDrop: (containerId: string) => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
}

export const InventoryGrid = ({
  container,
  containerId,
  dragState,
  onStartDrag,
  onUpdateGhost,
  onDrop,
  itemInfoRef,
}: InventoryGridProps) => {
  const gridRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef(container)
  containerRef.current = container
  const dragStateRef = useRef(dragState)
  dragStateRef.current = dragState

  const occupancy = buildOccupancyGrid(
    container,
    dragState?.sourceContainerId === containerId ? dragState.item.uid : undefined
  )

  const getGridPos = useCallback(
    (e: React.MouseEvent) => {
      if (!gridRef.current) return null
      const rect = gridRef.current.getBoundingClientRect()
      const x = Math.floor((e.clientX - rect.left) / INVENTORY_CELL_SIZE)
      const y = Math.floor((e.clientY - rect.top) / INVENTORY_CELL_SIZE)
      if (x < 0 || x >= container.width || y < 0 || y >= container.height) {
        return null
      }
      return { x, y }
    },
    [container.width, container.height]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const pos = getGridPos(e)
      if (!pos) return
      const occ = buildOccupancyGrid(
        containerRef.current,
        dragStateRef.current?.sourceContainerId === containerId ? dragStateRef.current.item.uid : undefined
      )
      const uid = occ[pos.y]?.[pos.x]
      if (uid) {
        onStartDrag(uid, containerId)
      }
    },
    [getGridPos, onStartDrag, containerId]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getGridPos(e)

      if (dragStateRef.current) {
        if (pos) {
          onUpdateGhost(pos.x, pos.y, containerId)
        }
        return
      }

      if (!pos) {
        itemInfoRef.current?.clear()
        return
      }

      const occ = buildOccupancyGrid(containerRef.current)
      const uid = occ[pos.y]?.[pos.x]
      if (uid) {
        const item = containerRef.current.items.find(i => i.uid === uid)
        if (item) {
          itemInfoRef.current?.show(item.definitionId)
        } else {
          itemInfoRef.current?.clear()
        }
      } else {
        itemInfoRef.current?.clear()
      }
    },
    [getGridPos, onUpdateGhost, containerId, itemInfoRef]
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if (!dragStateRef.current) return
      if (dragStateRef.current.isValid || dragStateRef.current.combineTarget) {
        onDrop(containerId)
      }
    },
    [onDrop, containerId]
  )

  const handleMouseLeave = useCallback(() => {
    if (!dragStateRef.current) {
      itemInfoRef.current?.clear()
    }
  }, [itemInfoRef])

  // Build a map of uid -> { definition, instance } for rendering icons
  const itemMap = new Map<string, { glyph: string; glyphColor: string; topLeftX: number; topLeftY: number }>()
  for (const item of container.items) {
    if (dragState?.sourceContainerId === containerId && dragState.item.uid === item.uid) {
      continue // skip the dragged item
    }
    const def = getDefinition(item.definitionId)
    itemMap.set(item.uid, {
      glyph: def.glyph,
      glyphColor: def.glyphColor,
      topLeftX: item.gridX,
      topLeftY: item.gridY,
    })
  }

  // Ghost shape cells — only in the container being hovered
  const ghostCells = new Set<string>()
  if (dragState && dragState.targetContainerId === containerId) {
    const def = getDefinition(dragState.item.definitionId)
    const shape = getRotatedShape(def.shape, dragState.rotation)
    for (let sy = 0; sy < shape.length; sy++) {
      for (let sx = 0; sx < (shape[sy]?.length ?? 0); sx++) {
        if (shape[sy]?.[sx]) {
          ghostCells.add(`${String(dragState.ghostX + sx)},${String(dragState.ghostY + sy)}`)
        }
      }
    }
  }

  const cells: React.ReactNode[] = []
  for (let y = 0; y < container.height; y++) {
    for (let x = 0; x < container.width; x++) {
      const uid = occupancy[y]?.[x]
      const isOccupied = uid !== null && uid !== undefined
      const itemInfo = uid ? itemMap.get(uid) : undefined
      const isTopLeft = itemInfo?.topLeftX === x && itemInfo?.topLeftY === y

      const ghostKey = `${String(x)},${String(y)}`
      const isGhost = ghostCells.has(ghostKey)

      const isCombineTarget = dragState?.combineTarget?.uid === uid && uid !== undefined
      const isCombineGhost = isGhost && dragState?.combineTarget
      const isCannotCombine = isGhost && dragState?.cannotCombine && isOccupied

      let bgClass = 'bg-grid-empty'
      let bgStyle: React.CSSProperties | undefined
      if (isCombineTarget || isCombineGhost || isCannotCombine) {
        bgClass = ''
        bgStyle = { backgroundColor: '#ff69b4' }
      } else if (isGhost) {
        bgClass = dragState?.isValid ? 'bg-grid-valid' : 'bg-grid-invalid'
      } else if (isOccupied && itemInfo) {
        bgClass = ''
        bgStyle = { backgroundColor: itemInfo.glyphColor }
      }

      cells.push(
        <div
          key={`${String(x)}-${String(y)}`}
          className={`border-grid-border flex items-center justify-center border font-mono text-xs ${bgClass}`}
          style={{ width: INVENTORY_CELL_SIZE, height: INVENTORY_CELL_SIZE, ...bgStyle }}
        >
          {(isCombineTarget || isCombineGhost) && dragState?.combineTarget ? (
            <span style={{ color: '#000' }}>
              {combineIcon(dragState.combineTarget.recipe, dragState.combineTarget.isDiscovered)}
            </span>
          ) : isTopLeft && itemInfo ? (
            <span style={{ color: '#000' }}>{itemInfo.glyph}</span>
          ) : isGhost && dragState ? (
            <span
              style={{
                color: getDefinition(dragState.item.definitionId).glyphColor,
                opacity: 0.6,
              }}
            >
              {x === dragState.ghostX && y === dragState.ghostY ? getDefinition(dragState.item.definitionId).glyph : ''}
            </span>
          ) : null}
        </div>
      )
    }
  }

  return (
    <div
      ref={gridRef}
      className="inline-grid select-none"
      style={{
        gridTemplateColumns: `repeat(${String(container.width)}, ${String(INVENTORY_CELL_SIZE)}px)`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {cells}
    </div>
  )
}
