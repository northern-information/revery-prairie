import { useEffect, useRef, useState } from 'react'

import { ACTION_COLOR } from '@/engine/constants'
import { ComponentType } from '@/engine/ecs/types'
import { spawnClickTarget } from '@/engine/effects'
import { canPlaceMeteoriteAt, placeMeteoriteAt } from '@/engine/entities'
import { removeItem } from '@/engine/inventory'
import { getBlockedPositions } from '@/engine/movement'
import { findPath } from '@/engine/pathfinding'
import { ORDINAL } from '@/engine/position'
import { playDrop, playPlace } from '@/engine/sfx'
import { TileType } from '@/engine/types'
import { getCurrentEntityZone, spatialAtInCurrentZone } from '@/engine/zone'
import type { DragState } from '@/engine/drag'
import type { CharMetrics, Container, GameState } from '@/engine/types'

interface UseCanvasDropOptions {
  dragState: DragState | null
  state: GameState
  containers: { id: string; container: Container }[]
  metricsRef: React.RefObject<CharMetrics | null>
  cancelDrag: () => void
  refreshUI: () => void
  itemInfoRef: React.RefObject<{ setDragging: (v: boolean) => void } | null>
}

export const useCanvasDrop = ({
  dragState,
  state,
  containers,
  metricsRef,
  cancelDrag,
  refreshUI,
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
      if (state.dragHoverTile !== null) {
        state.dragHoverTile = null
        refreshUI()
      }
      return
    }

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'CANVAS') {
        cursorTarget.current = 'canvas'
        canvasRect.current = target.getBoundingClientRect()
        // RP-18 — translate canvas cursor to a tile coordinate so the
        // stoneCircles render pass can draw a pink highlight on the
        // would-be drop tile. We use the canvas rect + metrics directly,
        // matching the formula used by the mouseup handler below.
        const metrics = metricsRef.current
        if (metrics) {
          const rect = canvasRect.current
          const mx = Math.floor((e.clientX - rect.left) / metrics.charWidth) + state.camera.x
          const my = Math.floor((e.clientY - rect.top) / metrics.charHeight) + state.camera.y
          const inBounds = mx >= 0 && mx < state.mapWidth && my >= 0 && my < state.mapHeight
          const tile = inBounds ? state.map[my]?.[mx] : null
          const next = tile && tile.type !== TileType.Space ? { x: mx, y: my } : null
          const current = state.dragHoverTile
          const same =
            (current === null && next === null) ||
            (current !== null && next !== null && current.x === next.x && current.y === next.y)
          if (!same) {
            state.dragHoverTile = next
            refreshUI()
          }
        }
      } else {
        cursorTarget.current = 'other'
        if (state.dragHoverTile !== null) {
          state.dragHoverTile = null
          refreshUI()
        }
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
        if (
          spatialAtInCurrentZone(state, mx, my).some(eid => {
            const tag = state.world.getComponent(eid, ComponentType.EntityTag)
            return tag === 'groundItem'
          })
        )
          return
        // RP-18 — meteorites drop into state.placedMeteorites, not as
        // a ground-item entity. Reject if the destination tile cannot
        // hold a stone circle marker (water, structural tile, occupied).
        if (defId === 'meteorite') {
          if (!canPlaceMeteoriteAt(state, mx, my)) return
          removeItem(container, itemUid)
          placeMeteoriteAt(state, mx, my, performance.now())
          spawnClickTarget(state, mx, my, performance.now())
          playPlace()
          refreshUI()
          return
        }
        removeItem(container, itemUid)
        if (defId === 'bee') {
          const beeEntity = state.world.createEntity()
          state.world.addComponent(beeEntity, ComponentType.Position, { x: mx, y: my })
          state.world.addComponent(beeEntity, ComponentType.EntityTag, 'bee')
          state.world.addComponent(beeEntity, ComponentType.EntityZone, getCurrentEntityZone(state))
        } else {
          const ge = state.world.createEntity()
          state.world.addComponent(ge, ComponentType.Position, { x: mx, y: my })
          state.world.addComponent(ge, ComponentType.ItemDrop, { definitionId: defId })
          state.world.addComponent(ge, ComponentType.EntityTag, 'groundItem')
          state.world.addComponent(ge, ComponentType.EntityZone, getCurrentEntityZone(state))
          state.world.addComponent(ge, ComponentType.PickupExemption, {})
        }
        spawnClickTarget(state, mx, my, performance.now())
        playDrop()
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
      const blocked = getBlockedPositions(state, undefined, { ignoreCoyote: true })
      let bestPath: ReturnType<typeof findPath> = null
      for (const d of ORDINAL) {
        const ax = mx + d.x
        const ay = my + d.y
        if (ax < 0 || ax >= state.mapWidth || ay < 0 || ay >= state.mapHeight) continue
        if (state.map[ay]?.[ax]?.type === TileType.Space) continue
        const p = findPath(state.map, state.mapWidth, state.mapHeight, state.player, { x: ax, y: ay }, blocked, {
          allowDiagonal: true,
        })
        if (p && (!bestPath || p.length < bestPath.length)) {
          bestPath = p
        }
      }

      if (bestPath && bestPath.length > 0) {
        state.previewFn = () =>
          Math.floor(Date.now() / 500) % 2 === 0
            ? [{ pos: { x: mx, y: my }, char: '#', color: ACTION_COLOR, isValid: true }]
            : []
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
  }, [isDragging, metricsRef, state, containers, cancelDrag, refreshUI, itemInfoRef])

  return {
    cursorPos,
    cursorTarget: cursorTarget.current,
    canvasRect: canvasRect.current,
  }
}
