import { useEffect, useRef } from 'react'

import { castLightningAtTarget, isValidLightningTarget } from '@/engine/actionBar'
import { getCharacterDefinition } from '@/engine/characters'
import { SELECTION_DRAG_THRESHOLD } from '@/engine/constants'
import { screenToTile } from '@/engine/coordinates'
import { isDeepTimeLocked } from '@/engine/deepTime'
import { ComponentType } from '@/engine/ecs/types'
import {
  advanceDialog,
  breakWall,
  interactWithCharacter,
  isInteractableAt,
  updateFacingEntity,
} from '@/engine/interaction'
import { getPathfindingBlockers } from '@/engine/movement'
import { findPath } from '@/engine/pathfinding'
import { isWalkableTile, posKey } from '@/engine/position'
import { deselectAll, getControllableUnitAt, getControllableUnitsInRect, hasSelection, selectUnit, selectUnits } from '@/engine/selection'
import { issueMoveCommand } from '@/engine/unitCommands'
import { TileType } from '@/engine/types'
import type { PermacomputerScreen } from './useKeyboard'
import type { CharMetrics, GameState, Position } from '@/engine/types'

interface UseMouseOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  state: GameState
  metricsRef: React.RefObject<CharMetrics | null>
  activeScreen: PermacomputerScreen
  setActiveScreen: (screen: PermacomputerScreen) => void
  refreshUI: () => void
  onDialog: (characterName: string, glyph: string, glyphColor: string, worldX: number, worldY: number) => void
  onDiscovery: (text: string, worldX: number, worldY: number, icon?: string, iconColor?: string) => void
  onGift: (text: string, icon: string, iconColor: string, worldX: number, worldY: number) => void
}

export const useMouse = ({
  canvasRef,
  state,
  metricsRef,
  activeScreen,
  setActiveScreen,
  refreshUI,
  onDialog,
  onDiscovery,
  onGift,
}: UseMouseOptions) => {
  const activeScreenRef = useRef(activeScreen)
  activeScreenRef.current = activeScreen

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Track drag state for box selection
    let mouseDownPos: { x: number; y: number } | null = null
    let isDragging = false

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return // left button only
      mouseDownPos = { x: e.offsetX, y: e.offsetY }
      isDragging = false
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseDownPos) return
      const dx = e.offsetX - mouseDownPos.x
      const dy = e.offsetY - mouseDownPos.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist >= SELECTION_DRAG_THRESHOLD) {
        isDragging = true
        state.selectionBox = {
          startScreen: mouseDownPos,
          endScreen: { x: e.offsetX, y: e.offsetY },
        }
        refreshUI()
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return

      if (isDragging && mouseDownPos) {
        // Complete drag-box selection
        const metrics = metricsRef.current
        if (metrics) {
          const startTile = screenToTile(
            Math.min(mouseDownPos.x, e.offsetX),
            Math.min(mouseDownPos.y, e.offsetY),
            state.camera,
            metrics.charWidth,
            metrics.charHeight
          )
          const endTile = screenToTile(
            Math.max(mouseDownPos.x, e.offsetX),
            Math.max(mouseDownPos.y, e.offsetY),
            state.camera,
            metrics.charWidth,
            metrics.charHeight
          )
          const units = getControllableUnitsInRect(state, startTile, endTile)
          if (units.length > 0) {
            selectUnits(state, units)
          } else {
            deselectAll(state)
          }
          refreshUI()
        }
        state.selectionBox = null
        mouseDownPos = null
        isDragging = false
        return
      }

      mouseDownPos = null
      isDragging = false
      state.selectionBox = null
    }

    const handleClick = (e: MouseEvent) => {
      if (state.devPanelOpen) return
      if (activeScreenRef.current === 'system') return
      if (isDeepTimeLocked(state)) return

      // Lightning targeting mode: click to cast at cursor tile
      if (state.targetingSlot !== null) {
        const metrics = metricsRef.current
        if (!metrics) return
        const tile = screenToTile(e.offsetX, e.offsetY, state.camera, metrics.charWidth, metrics.charHeight)
        if (!isValidLightningTarget(state, tile)) return
        const success = castLightningAtTarget(state, tile, state.targetingSlot, performance.now())
        if (success) {
          onDiscovery?.('lightning strikes!', tile.x, tile.y, '|', '#FFFFFF')
        }
        refreshUI()
        return
      }

      if (state.activeDialog) {
        const result = advanceDialog(state, performance.now())
        if (result.gift) {
          onGift(
            `received ${result.gift.name.toLowerCase()}`,
            result.gift.glyphs[0],
            result.gift.glyphColor,
            state.player.x,
            state.player.y
          )
        }
        refreshUI()
        return
      }

      // If we just completed a drag-box, skip the click
      if (isDragging) return

      const metrics = metricsRef.current
      if (!metrics) return

      const tile = screenToTile(e.offsetX, e.offsetY, state.camera, metrics.charWidth, metrics.charHeight)

      if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return

      // Check if we clicked on a controllable unit
      const clickedUnit = getControllableUnitAt(state, tile)
      if (clickedUnit !== null) {
        // Cancel any player path
        state.path = null
        state.pathWaypoints = []
        state.pendingAction = null
        state.pendingInteractionTarget = null

        // Toggle: if clicking the only selected unit, deselect
        if (state.selectedUnits.size === 1 && state.selectedUnits.has(clickedUnit)) {
          deselectAll(state)
        } else {
          selectUnit(state, clickedUnit)
        }
        refreshUI()
        return
      }

      // Clicked on non-unit tile — deselect all units
      if (hasSelection(state)) {
        deselectAll(state)
        refreshUI()
        // Fall through to normal click-to-move behavior
      }

      if (!isWalkableTile(state.map[tile.y][tile.x].type) && !isInteractableAt(state, tile.x, tile.y)) return
      if (tile.x === state.player.x && tile.y === state.player.y) return

      const blocked = getPathfindingBlockers(state, tile)

      const adjacentDeltas = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ]

      // Resolve click target and pending action based on what was clicked
      let walkTarget: Position = tile
      let action: (() => void) | null = null

      const clickedCharacterEid = state.world.spatial
        .at(tile.x, tile.y)
        .find(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'character')
      let clickedCharacterIdentity =
        clickedCharacterEid !== undefined
          ? state.world.getComponent(clickedCharacterEid, ComponentType.CharacterIdentity)
          : null

      // Angels use MultiPosition instead of the spatial index — check body tiles
      let clickedBodyPositions: { x: number; y: number }[] | null = null
      if (!clickedCharacterIdentity) {
        const tileKey = posKey(tile.x, tile.y)
        for (const eid of state.world.query(
          ComponentType.AngelData,
          ComponentType.MultiPosition,
          ComponentType.CharacterIdentity
        )) {
          const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
          if (multi?.positions.some(p => posKey(p.x, p.y) === tileKey)) {
            clickedCharacterIdentity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
            clickedBodyPositions = multi.positions
            break
          }
        }
      }
      const clickedInteractableTile =
        !clickedCharacterIdentity && isInteractableAt(state, tile.x, tile.y)

      if (clickedCharacterIdentity || clickedInteractableTile) {
        // Find closest adjacent walkable tile to the entity.
        // For multi-tile bodies (angels), scan all tiles adjacent to the full body
        // perimeter — not just the single clicked tile — so interior clicks work.
        const bodyTiles = clickedBodyPositions ?? [tile]
        const bodyKeys = new Set(bodyTiles.map(p => posKey(p.x, p.y)))
        let bestTarget: { x: number; y: number } | null = null
        let bestDist = Infinity
        for (const bt of bodyTiles) {
          for (const d of adjacentDeltas) {
            const ax = bt.x + d.x
            const ay = bt.y + d.y
            if (ax < 0 || ax >= state.mapWidth || ay < 0 || ay >= state.mapHeight) continue
            if (bodyKeys.has(posKey(ax, ay))) continue
            if (!isWalkableTile(state.map[ay][ax].type)) continue
            if (blocked.has(posKey(ax, ay))) continue
            const dist = Math.abs(ax - state.player.x) + Math.abs(ay - state.player.y)
            if (dist < bestDist) {
              bestDist = dist
              bestTarget = { x: ax, y: ay }
            }
          }
        }
        if (!bestTarget) return
        walkTarget = bestTarget

        // Track the interactable target for highlight rendering during walk
        state.pendingInteractionTarget = { x: tile.x, y: tile.y }

        if (clickedCharacterIdentity) {
          const charDef = getCharacterDefinition(clickedCharacterIdentity.definitionId)
          action = () => {
            state.pendingInteractionTarget = null
            const result = interactWithCharacter(state)
            if (result.opened) {
              onDialog(charDef.name, charDef.glyph, charDef.glyphColor, state.player.x, state.player.y)
            }
            refreshUI()
          }
        } else if (clickedInteractableTile) {
          const targetX = tile.x
          const targetY = tile.y
          action = () => {
            state.pendingInteractionTarget = null
            // Face toward the interactable tile
            const dx = targetX - state.player.x
            const dy = targetY - state.player.y
            if (dx === 1) state.playerFacing = 'right'
            else if (dx === -1) state.playerFacing = 'left'
            else if (dy === -1) state.playerFacing = 'up'
            else if (dy === 1) state.playerFacing = 'down'
            updateFacingEntity(state)
            // Try breakable wall
            if (state.map[targetY]?.[targetX]?.type === TileType.CaveBreakableWall) {
              if (breakWall(state, performance.now())) {
                onDiscovery('discovered hidden room!', state.player.x, state.player.y)
              }
            }
            refreshUI()
          }
        }

        // If already adjacent, execute immediately (no chaining)
        if (walkTarget.x === state.player.x && walkTarget.y === state.player.y) {
          action?.()
          return
        }
      }

      // Shift+click: chain waypoints onto existing path
      if (e.shiftKey && state.path && state.path.length > 0) {
        const lastWaypoint = state.pathWaypoints[state.pathWaypoints.length - 1]
        if (lastWaypoint?.x === walkTarget.x && lastWaypoint?.y === walkTarget.y) return
        const chainFrom = state.path[state.path.length - 1]
        const extension = findPath(state.map, state.mapWidth, state.mapHeight, chainFrom, walkTarget, blocked)
        if (!extension || extension.length === 0) return
        state.path.push(...extension)
        state.pathWaypoints.push(walkTarget)
        state.pendingAction = action
        state.previewFn = null
        return
      }

      // Normal click: new path
      state.pendingAction = action
      if (!action) state.pendingInteractionTarget = null
      state.previewFn = null
      state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, walkTarget, blocked)
      state.pathWaypoints = state.path ? [walkTarget] : []
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()

      // Lightning targeting cancel
      if (state.targetingSlot !== null) {
        state.targetingSlot = null
        state.previewFn = null
        refreshUI()
        return
      }

      if (state.devPanelOpen) return
      if (isDeepTimeLocked(state)) return
      if (state.activeDialog) return

      // Right-click move command for selected units
      if (!hasSelection(state)) return

      const metrics = metricsRef.current
      if (!metrics) return

      const tile = screenToTile(e.offsetX, e.offsetY, state.camera, metrics.charWidth, metrics.charHeight)
      if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return
      if (!isWalkableTile(state.map[tile.y][tile.x].type)) return

      issueMoveCommand(state, tile)
      refreshUI()
    }

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [canvasRef, state, metricsRef, setActiveScreen, refreshUI, onDialog, onDiscovery, onGift])
}
