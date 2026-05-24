import { useCallback, useRef } from 'react'

import { COIN_DULL_COLOR, COIN_POP_DURATION_MS, INVENTORY_CELL_SIZE } from '@/engine/constants'
import { buildOccupancyGrid } from '@/engine/inventory'
import { getDefinition } from '@/engine/items'
import { combineIcon } from '@/engine/recipes'
import type { ItemInfoHandle } from './ItemInfo'
import type { DragState } from '@/engine/drag'
import type { Container } from '@/engine/types'

type CoinState = 'dull' | 'glint' | 'glint-pop'

interface InventoryGridProps {
  container: Container
  containerId: string
  dragState: DragState | null
  onStartDrag: (uid: string, containerId: string) => void
  onUpdatePreview: (gridX: number, gridY: number, containerId: string) => void
  onDrop: (containerId: string) => void
  onQuickTransfer?: (uid: string, containerId: string) => void
  // RP-18 — emits the definitionId of the currently hovered item
  // (or null on leave / hover over empty cell). InventoryPanel translates
  // a 'meteorite' hover into a state.stoneCirclePreview write that the
  // stoneCircles render pass reads.
  onItemHover?: (definitionId: string | null) => void
  itemInfoRef: React.RefObject<ItemInfoHandle | null>
  glintingCoins?: Set<string>
  coinGlintPopTimes?: Map<string, number>
}

export const InventoryGrid = ({
  container,
  containerId,
  dragState,
  onStartDrag,
  onUpdatePreview,
  onDrop,
  onQuickTransfer,
  onItemHover,
  itemInfoRef,
  glintingCoins,
  coinGlintPopTimes,
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

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if (!onQuickTransfer) return
      const pos = getGridPos(e)
      if (!pos) return
      const occ = buildOccupancyGrid(containerRef.current)
      const uid = occ[pos.y]?.[pos.x]
      if (uid) {
        onQuickTransfer(uid, containerId)
      }
    },
    [getGridPos, onQuickTransfer, containerId]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = getGridPos(e)

      if (dragStateRef.current) {
        if (pos) {
          onUpdatePreview(pos.x, pos.y, containerId)
        }
        return
      }

      if (!pos) {
        itemInfoRef.current?.clear()
        onItemHover?.(null)
        return
      }

      const occ = buildOccupancyGrid(containerRef.current)
      const uid = occ[pos.y]?.[pos.x]
      if (uid) {
        const item = containerRef.current.items.find(i => i.uid === uid)
        if (item) {
          itemInfoRef.current?.show(item.definitionId, item.uid)
          onItemHover?.(item.definitionId)
        } else {
          itemInfoRef.current?.clear()
          onItemHover?.(null)
        }
      } else {
        itemInfoRef.current?.clear()
        onItemHover?.(null)
      }
    },
    [getGridPos, onUpdatePreview, containerId, itemInfoRef, onItemHover]
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
      onItemHover?.(null)
    }
  }, [itemInfoRef, onItemHover])

  // Build a map of uid -> { definition, instance } for rendering icons.
  // coinState is null for non-coin items and one of dull|glint|glint-pop
  // for coins. The pop variant is gated on a recent unglinted→glinted
  // transition recorded by movement.ts in state.coinGlintPopTimes.
  const now = performance.now()
  const itemMap = new Map<
    string,
    { glyph: string; glyphColor: string; topLeftX: number; topLeftY: number; coinState: CoinState | null }
  >()
  for (const item of container.items) {
    if (dragState?.sourceContainerId === containerId && dragState.item.uid === item.uid) {
      continue // skip the dragged item
    }
    const def = getDefinition(item.definitionId)
    let coinState: CoinState | null = null
    if (item.definitionId === 'coin') {
      if (glintingCoins?.has(item.uid) === true) {
        const popTime = coinGlintPopTimes?.get(item.uid)
        coinState = popTime !== undefined && now - popTime < COIN_POP_DURATION_MS ? 'glint-pop' : 'glint'
      } else {
        coinState = 'dull'
      }
    }
    itemMap.set(item.uid, {
      glyph: def.glyph,
      glyphColor: coinState === 'dull' ? COIN_DULL_COLOR : def.glyphColor,
      topLeftX: item.gridX,
      topLeftY: item.gridY,
      coinState,
    })
  }

  // Preview cell — only in the container being hovered
  const previewCells = new Set<string>()
  if (dragState?.targetContainerId === containerId) {
    previewCells.add(`${String(dragState.previewX)},${String(dragState.previewY)}`)
  }

  const cells: React.ReactNode[] = []
  for (let y = 0; y < container.height; y++) {
    for (let x = 0; x < container.width; x++) {
      const uid = occupancy[y]?.[x]
      const isOccupied = uid !== null && uid !== undefined
      const itemInfo = uid ? itemMap.get(uid) : undefined
      const isTopLeft = itemInfo?.topLeftX === x && itemInfo?.topLeftY === y

      const previewKey = `${String(x)},${String(y)}`
      const isPreview = previewCells.has(previewKey)

      const isCombineTarget = dragState?.combineTarget?.uid === uid && uid !== undefined
      const isCombinePreview = isPreview && dragState?.combineTarget
      const isCannotCombine = isPreview && dragState?.cannotCombine && isOccupied

      let bgClass = 'bg-grid-empty'
      let bgStyle: React.CSSProperties | undefined
      if (isCombineTarget || isCombinePreview || isCannotCombine) {
        bgClass = ''
        bgStyle = { backgroundColor: '#ff69b4' }
      } else if (isPreview) {
        bgClass = dragState?.isValid ? 'bg-grid-valid' : 'bg-grid-invalid'
      } else if (isOccupied && itemInfo) {
        bgClass = ''
        bgStyle = { backgroundColor: itemInfo.glyphColor }
      }

      // Coin animation classes only on the top-left cell of the coin,
      // matching where the glyph renders. Cells that are not the
      // top-left coin cell carry no animation, and non-coin items
      // carry no data-coin-state.
      const coinState = isTopLeft && itemInfo ? itemInfo.coinState : null
      const animationClass =
        coinState === 'glint-pop' ? ' coin-cell-pop' : coinState === 'glint' ? ' coin-cell-glint' : ''
      const dataCoinState = coinState ?? undefined

      cells.push(
        <div
          key={`${String(x)}-${String(y)}`}
          className={`border-grid-border flex items-center justify-center border font-mono text-xs ${bgClass}${animationClass}`}
          style={{ width: INVENTORY_CELL_SIZE, height: INVENTORY_CELL_SIZE, ...bgStyle }}
          data-coin-state={dataCoinState}
        >
          {(isCombineTarget || isCombinePreview) && dragState?.combineTarget ? (
            <span style={{ color: '#000' }}>
              {combineIcon(dragState.combineTarget.recipe, dragState.combineTarget.isDiscovered)}
            </span>
          ) : isTopLeft && itemInfo ? (
            <span style={{ color: '#000' }}>{itemInfo.glyph}</span>
          ) : isPreview && dragState ? (
            <span
              style={{
                color: getDefinition(dragState.item.definitionId).glyphColor,
                opacity: 0.6,
              }}
            >
              {x === dragState.previewX && y === dragState.previewY
                ? getDefinition(dragState.item.definitionId).glyph
                : ''}
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
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {cells}
    </div>
  )
}
