import { useEffect, useRef } from 'react'

import { castLightningAtTarget, isValidLightningTarget } from '@/engine/actionBar'
import { getCharacterDefinition } from '@/engine/characters'
import { expandClickTile } from '@/engine/clickResolution'
import { SELECTION_DRAG_THRESHOLD } from '@/engine/constants'
import { screenToTile } from '@/engine/coordinates'
import { isDeepTimeLocked } from '@/engine/deepTime'
import { ComponentType } from '@/engine/ecs/types'
import { recenterCamera } from '@/engine/edgeScroll'
import { completeGenesis, GENESIS_EPOCHS } from '@/engine/genesis'
import {
  advanceDialog,
  breakWall,
  clearRuinDebris,
  interactWithCharacter,
  isInteractableAt,
  openLockedGateDialog,
  unlockRuinDoor,
  updateFacingEntity,
} from '@/engine/interaction'
import { getPathfindingBlockers } from '@/engine/movement'
import { findPath } from '@/engine/pathfinding'
import { isWalkableTile, posKey } from '@/engine/position'
import {
  commitBoxSelection,
  deselectAll,
  getControllableUnitAt,
  getControllableUnitsInRect,
  hasSelection,
  isPlayerInRect,
  selectPlayer,
  selectUnit,
} from '@/engine/selection'
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

/**
 * Resolve the walk target + pending action for a click on a tile.
 * Returns null if nothing actionable (e.g. no adjacent walkable tile exists
 * for an interactable). For empty tiles, returns the tile itself with a
 * null action.
 */
const resolveClickTarget = (
  state: GameState,
  tile: Position,
  blocked: Set<string>,
  onDialog: UseMouseOptions['onDialog'],
  onDiscovery: UseMouseOptions['onDiscovery'],
  refreshUI: () => void
): { walkTarget: Position; action: (() => void) | null; interactableTile: Position | null } | null => {
  const adjacentDeltas = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ]

  const clickedCharacterEid = state.world.spatial
    .at(tile.x, tile.y)
    .find(eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'character')
  let clickedCharacterIdentity =
    clickedCharacterEid !== undefined
      ? state.world.getComponent(clickedCharacterEid, ComponentType.CharacterIdentity)
      : null

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
    if (!bestTarget) return null

    let action: (() => void) | null = null
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
        const dx = targetX - state.player.x
        const dy = targetY - state.player.y
        if (dx === 1) state.playerFacing = 'right'
        else if (dx === -1) state.playerFacing = 'left'
        else if (dy === -1) state.playerFacing = 'up'
        else if (dy === 1) state.playerFacing = 'down'
        updateFacingEntity(state)
        if (state.map[targetY]?.[targetX]?.type === TileType.CaveBreakableWall) {
          if (breakWall(state, performance.now())) {
            onDiscovery('Discovered hidden room.', state.player.x, state.player.y)
          }
        } else if (state.map[targetY]?.[targetX]?.type === TileType.RuinDoorLocked) {
          if (unlockRuinDoor(state)) {
            onDiscovery('the lock turns', state.player.x, state.player.y)
          } else {
            openLockedGateDialog(state)
          }
        } else if (state.map[targetY]?.[targetX]?.type === TileType.RuinDebris) {
          clearRuinDebris(state)
        }
        refreshUI()
      }
    }
    return { walkTarget: bestTarget, action, interactableTile: { x: tile.x, y: tile.y } }
  }

  return { walkTarget: tile, action: null, interactableTile: null }
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

    // `justFinishedDrag` outlives handleMouseUp so the paired `click` event
    // (fired after mouseup by the browser) can be skipped. Without this the
    // click handler would see isDragging=false and fall through to selection
    // toggle / deselect, causing a drag-release to also clear selection.
    let mouseDownPos: { x: number; y: number } | null = null
    let isDragging = false
    let justFinishedDrag = false

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (state.genesis && state.genesis.epochIndex < GENESIS_EPOCHS.length) {
        completeGenesis(state)
        refreshUI()
        return
      }
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
        const metrics = metricsRef.current
        if (metrics) {
          const startTile = screenToTile(
            Math.min(mouseDownPos.x, e.offsetX),
            Math.min(mouseDownPos.y, e.offsetY),
            state.camera,
            metrics.charWidth,
            metrics.charHeight,
            state.viewportWidth,
            state.viewportHeight,
          )
          const endTile = screenToTile(
            Math.max(mouseDownPos.x, e.offsetX),
            Math.max(mouseDownPos.y, e.offsetY),
            state.camera,
            metrics.charWidth,
            metrics.charHeight,
            state.viewportWidth,
            state.viewportHeight,
          )
          const units = getControllableUnitsInRect(state, startTile, endTile)
          const includePlayer = isPlayerInRect(state, startTile, endTile)
          commitBoxSelection(state, units, includePlayer)
          refreshUI()
        }
        state.selectionBox = null
        mouseDownPos = null
        isDragging = false
        justFinishedDrag = true
        return
      }

      mouseDownPos = null
      isDragging = false
      state.selectionBox = null
    }

    const handleClick = (e: MouseEvent) => {
      // Consume the flag set by a just-completed drag-select. Runs before
      // any other branch so drag release never falls through.
      if (justFinishedDrag) {
        justFinishedDrag = false
        return
      }

      if (state.devPanelOpen) return
      if (activeScreenRef.current === 'system') return
      if (isDeepTimeLocked(state)) return

      if (state.targetingSlot !== null) {
        const metrics = metricsRef.current
        if (!metrics) return
        const tile = screenToTile(
          e.offsetX,
          e.offsetY,
          state.camera,
          metrics.charWidth,
          metrics.charHeight,
          state.viewportWidth,
          state.viewportHeight,
        )
        if (!isValidLightningTarget(state, tile)) return
        const success = castLightningAtTarget(state, tile, state.targetingSlot, performance.now())
        if (success) {
          onDiscovery?.('Lightning strikes.', tile.x, tile.y, '|', '#FFFFFF')
        }
        refreshUI()
        return
      }

      if (state.activeDialog) {
        const result = advanceDialog(state, performance.now())
        if (result.gift) {
          onGift(
            `Received ${result.gift.name}.`,
            result.gift.glyphs[0],
            result.gift.glyphColor,
            state.player.x,
            state.player.y
          )
        }
        refreshUI()
        return
      }

      const metrics = metricsRef.current
      if (!metrics) return

      const rawTile = screenToTile(
        e.offsetX,
        e.offsetY,
        state.camera,
        metrics.charWidth,
        metrics.charHeight,
        state.viewportWidth,
        state.viewportHeight,
      )
      if (rawTile.x < 0 || rawTile.x >= state.mapWidth || rawTile.y < 0 || rawTile.y >= state.mapHeight) return
      // Forgiving hit-test: if the geometric tile has no clickable, snap to
      // a cardinal-neighbor tile that does.
      const tile = expandClickTile(state, rawTile)

      // Click on the player tile — toggle player selection
      if (tile.x === state.player.x && tile.y === state.player.y) {
        state.path = null
        state.pathWaypoints = []
        state.pendingAction = null
        state.pendingInteractionTarget = null
        if (state.playerSelected && state.selectedUnits.size === 0) {
          deselectAll(state)
        } else {
          selectPlayer(state)
        }
        refreshUI()
        return
      }

      // Click on a controllable NPC unit — toggle-select
      const clickedUnit = getControllableUnitAt(state, tile)
      if (clickedUnit !== null) {
        state.path = null
        state.pathWaypoints = []
        state.pendingAction = null
        state.pendingInteractionTarget = null
        if (
          state.selectedUnits.size === 1 &&
          state.selectedUnits.has(clickedUnit) &&
          !state.playerSelected
        ) {
          deselectAll(state)
        } else {
          selectUnit(state, clickedUnit)
        }
        refreshUI()
        return
      }

      // Left-click on interactable — pathfind + interact (preserved behavior)
      const blocked = getPathfindingBlockers(state, tile)
      const resolved = resolveClickTarget(state, tile, blocked, onDialog, onDiscovery, refreshUI)
      if (resolved && resolved.action !== null) {
        deselectAll(state)
        state.pendingInteractionTarget = resolved.interactableTile
        if (resolved.walkTarget.x === state.player.x && resolved.walkTarget.y === state.player.y) {
          resolved.action()
          refreshUI()
          return
        }
        state.pendingAction = resolved.action
        state.previewFn = null
        recenterCamera(state)
        state.path = findPath(
          state.map,
          state.mapWidth,
          state.mapHeight,
          state.player,
          resolved.walkTarget,
          blocked,
          { allowDiagonal: true },
        )
        state.pathWaypoints = state.path ? [resolved.walkTarget] : []
        refreshUI()
        return
      }

      // Bare left-click on empty ground — clear any selection
      if (hasSelection(state)) {
        deselectAll(state)
        refreshUI()
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()

      if (state.targetingSlot !== null) {
        state.targetingSlot = null
        state.previewFn = null
        refreshUI()
        return
      }

      if (state.devPanelOpen) return
      if (activeScreenRef.current === 'system') return
      if (isDeepTimeLocked(state)) return
      if (state.activeDialog) return

      const metrics = metricsRef.current
      if (!metrics) return

      const tile = screenToTile(
        e.offsetX,
        e.offsetY,
        state.camera,
        metrics.charWidth,
        metrics.charHeight,
        state.viewportWidth,
        state.viewportHeight,
      )
      if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return

      // With a selection, issue a unit move command (handles player + NPCs).
      if (hasSelection(state)) {
        if (!isWalkableTile(state.map[tile.y][tile.x].type)) return
        issueMoveCommand(state, tile)
        refreshUI()
        return
      }

      // No selection — right-click moves/interacts the player
      if (!isWalkableTile(state.map[tile.y][tile.x].type) && !isInteractableAt(state, tile.x, tile.y)) return
      if (tile.x === state.player.x && tile.y === state.player.y) return

      recenterCamera(state)

      const blocked = getPathfindingBlockers(state, tile)
      const resolved = resolveClickTarget(state, tile, blocked, onDialog, onDiscovery, refreshUI)
      if (!resolved) return

      const { walkTarget, action, interactableTile } = resolved
      if (interactableTile) {
        state.pendingInteractionTarget = interactableTile
      }

      if (walkTarget.x === state.player.x && walkTarget.y === state.player.y) {
        action?.()
        refreshUI()
        return
      }

      // Shift+right-click: chain waypoints onto an existing path
      if (e.shiftKey && state.path && state.path.length > 0) {
        const lastWaypoint = state.pathWaypoints[state.pathWaypoints.length - 1]
        if (lastWaypoint?.x === walkTarget.x && lastWaypoint?.y === walkTarget.y) return
        const chainFrom = state.path[state.path.length - 1]
        const extension = findPath(state.map, state.mapWidth, state.mapHeight, chainFrom, walkTarget, blocked, {
          allowDiagonal: true,
        })
        if (!extension || extension.length === 0) return
        state.path.push(...extension)
        state.pathWaypoints.push(walkTarget)
        state.pendingAction = action
        state.previewFn = null
        state.pathIsChained = true
        refreshUI()
        return
      }

      state.pendingAction = action
      if (!action) state.pendingInteractionTarget = null
      state.previewFn = null
      state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, walkTarget, blocked, {
        allowDiagonal: true,
      })
      state.pathWaypoints = state.path ? [walkTarget] : []
      // Shift+right-click with no prior path still marks the path as chained
      // so the projected-path overlay renders for it. A plain right-click
      // clears the flag so its path renders no glyphs.
      state.pathIsChained = e.shiftKey && state.path !== null
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
