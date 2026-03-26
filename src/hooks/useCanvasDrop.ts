import { useEffect, useRef, useState } from 'react'

import { getBlockedPositions } from '@/engine/actions'
import { removeItem } from '@/engine/inventory'
import { findPath } from '@/engine/pathfinding'
import { ORDINAL } from '@/engine/position'
import { TileType } from '@/engine/types'
import type { DragState } from './useInventoryDrag'
import type { CharMetrics } from '@/engine/renderer'
import type { Container, GameState } from '@/engine/types'

interface UseCanvasDropOptions {
  dragState: DragState | null
  state: GameState
  containers: { id: string; container: Container }[]
  metricsRef: React.RefObject<CharMetrics | null>
  cancelDrag: () => void
  refreshUI: () => void
  onDropLog: (definitionId: string, worldX: number, worldY: number) => void
  itemInfoRef: React.RefObject<{ setDragging: (v: boolean) => void } | null>
}

export const useCanvasDrop = ({
  dragState,
  state,
  containers,
  metricsRef,
  cancelDrag,
  refreshUI,
  onDropLog,
  itemInfoRef,
}: UseCanvasDropOptions) => {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const cursorTarget = useRef<'canvas' | 'other'>('other')
  const canvasRect = useRef<DOMRect | null>(null)
  const isDragging = dragState !== null
  const dragStateRef = useRef(dragState)
  dragStateRef.current = dragState

  useEffect(() => {
    if (!isDragging) {
      setCursorPos(null)
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'CANVAS') {
        cursorTarget.current = 'canvas'
        canvasRect.current = target.getBoundingClientRect()
      } else {
        cursorTarget.current = 'other'
      }
      setCursorPos({ x: e.clientX, y: e.clientY })
    }

    const handleGlobalMouseUp = (e: MouseEvent) => {
      const ds = dragStateRef.current
      if (!ds) return

      const metrics = metricsRef.current
      if (!metrics) return

      const target = e.target as HTMLElement
      if (target.tagName !== 'CANVAS') return

      const rect = target.getBoundingClientRect()
      const mx = Math.floor((e.clientX - rect.left) / metrics.charWidth) + state.camera.x
      const my = Math.floor((e.clientY - rect.top) / metrics.charHeight) + state.camera.y

      if (mx < 0 || mx >= state.mapWidth || my < 0 || my >= state.mapHeight) return
      const tile = state.map[my]?.[mx]
      if (!tile || tile.type === TileType.Space) return

      const container = containers.find(c => c.id === ds.sourceContainerId)?.container
      if (!container) return

      const itemUid = ds.item.uid
      const defId = ds.item.definitionId

      const executeDrop = () => {
        const item = container.items.find(i => i.uid === itemUid)
        if (!item) return
        if (state.groundItems.some(g => g.pos.x === mx && g.pos.y === my)) return
        if (state.groundOmniboxes.some(g => g.pos.x === mx && g.pos.y === my)) return
        removeItem(container, itemUid)
        if (defId === 'bee') {
          state.bees.push({ pos: { x: mx, y: my } })
        } else if (defId === 'omnibox') {
          state.groundOmniboxes.push({ uid: itemUid, pos: { x: mx, y: my } })
        } else {
          state.groundItems.push({ definitionId: defId, pos: { x: mx, y: my } })
        }
        onDropLog(defId, mx, my)
        refreshUI()
      }

      // If on the target or already adjacent, drop immediately
      const dx = Math.abs(state.player.x - mx)
      const dy = Math.abs(state.player.y - my)
      if (dx <= 1 && dy <= 1) {
        executeDrop()
        cancelDrag()
        itemInfoRef.current?.setDragging(false)
        refreshUI()
        return
      }

      // Find an adjacent walkable tile to pathfind to
      const blocked = getBlockedPositions(state)
      let bestPath: ReturnType<typeof findPath> = null
      for (const d of ORDINAL) {
        const ax = mx + d.x
        const ay = my + d.y
        if (ax < 0 || ax >= state.mapWidth || ay < 0 || ay >= state.mapHeight) continue
        if (state.map[ay]?.[ax]?.type === TileType.Space) continue
        const p = findPath(state.map, state.mapWidth, state.mapHeight, state.player, { x: ax, y: ay }, blocked)
        if (p && (!bestPath || p.length < bestPath.length)) {
          bestPath = p
        }
      }

      if (bestPath && bestPath.length > 0) {
        state.previewFn = () =>
          Math.floor(Date.now() / 500) % 2 === 0 ? [{ pos: { x: mx, y: my }, char: '#', color: '#ff69b4' }] : []
        state.path = bestPath
        state.pendingAction = () => {
          executeDrop()
          state.previewFn = null
        }
      } else {
        executeDrop()
      }

      cancelDrag()
      itemInfoRef.current?.setDragging(false)
      refreshUI()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, metricsRef, state, containers, cancelDrag, refreshUI, itemInfoRef, onDropLog])

  return {
    cursorPos,
    cursorTarget: cursorTarget.current,
    canvasRect: canvasRect.current,
  }
}
