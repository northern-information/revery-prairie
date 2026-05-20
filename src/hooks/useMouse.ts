import { useEffect, useRef } from 'react'

import { updateCamera } from '@/engine/camera'
import { expandClickTile } from '@/engine/clickResolution'
import { SELECTION_DRAG_THRESHOLD } from '@/engine/constants'
import { screenToTile } from '@/engine/coordinates'
import { isDeepTimeLocked } from '@/engine/deepTime'
import { ComponentType } from '@/engine/ecs/types'
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
  selectUnit,
} from '@/engine/selection'
import { TileType, Zone } from '@/engine/types'
import { issueMoveCommand } from '@/engine/unitCommands'
import { isInputGated } from '@/engine/zoneTransition'
import type { PermacomputerScreen } from './useKeyboard'
import type { CharMetrics, GameState, Position } from '@/engine/types'

interface UseMouseOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  state: GameState
  metricsRef: React.RefObject<CharMetrics | null>
  activeScreen: PermacomputerScreen
  setActiveScreen: (screen: PermacomputerScreen) => void
  refreshUI: () => void
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
  const clickedInteractableTile = !clickedCharacterIdentity && isInteractableAt(state, tile.x, tile.y)

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
      action = () => {
        state.pendingInteractionTarget = null
        interactWithCharacter(state)
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
          breakWall(state, performance.now())
        } else if (state.map[targetY]?.[targetX]?.type === TileType.RuinDoorLocked) {
          if (!unlockRuinDoor(state)) {
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
            state.viewportHeight
          )
          const endTile = screenToTile(
            Math.max(mouseDownPos.x, e.offsetX),
            Math.max(mouseDownPos.y, e.offsetY),
            state.camera,
            metrics.charWidth,
            metrics.charHeight,
            state.viewportWidth,
            state.viewportHeight
          )
          const units = getControllableUnitsInRect(state, startTile, endTile)
          commitBoxSelection(state, units)
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
      if (isInputGated(state)) return

      if (state.activeDialog) {
        advanceDialog(state, performance.now())
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
        state.viewportHeight
      )
      if (rawTile.x < 0 || rawTile.x >= state.mapWidth || rawTile.y < 0 || rawTile.y >= state.mapHeight) return

      // Precis #9b — burn-line draw mode. Clicks chain burn-line waypoints
      // instead of moving the player. Origin click (no shift) resets the
      // line; shift+click appends if 4-neighbor adjacent. Non-walkable or
      // non-overworld clicks are ignored.
      if (state.burnDrawMode && state.currentZone === Zone.Overworld) {
        const targetTile = state.map[rawTile.y][rawTile.x]
        if (!isWalkableTile(targetTile.type)) return
        if (e.shiftKey && state.burnLineDraft && state.burnLineDraft.length > 0) {
          const last = state.burnLineDraft[state.burnLineDraft.length - 1]
          const dx = Math.abs(rawTile.x - last.x)
          const dy = Math.abs(rawTile.y - last.y)
          const adjacent = (dx === 1 && dy === 0) || (dx === 0 && dy === 1)
          if (!adjacent) return
          state.burnLineDraft = [...state.burnLineDraft, { x: rawTile.x, y: rawTile.y }]
        } else {
          state.burnLineDraft = [{ x: rawTile.x, y: rawTile.y }]
        }
        refreshUI()
        return
      }

      // Forgiving hit-test: if the geometric tile has no clickable, snap to
      // a cardinal-neighbor tile that does.
      const tile = expandClickTile(state, rawTile)

      // Click on the player tile — no-op (player is not mouse-selectable)
      if (tile.x === state.player.x && tile.y === state.player.y) {
        return
      }

      // Click on a controllable NPC unit — toggle-select
      const clickedUnit = getControllableUnitAt(state, tile)
      if (clickedUnit !== null) {
        state.path = null
        state.pathWaypoints = []
        state.pendingAction = null
        state.pendingInteractionTarget = null
        if (state.selectedUnits.size === 1 && state.selectedUnits.has(clickedUnit)) {
          deselectAll(state)
        } else {
          selectUnit(state, clickedUnit)
        }
        refreshUI()
        return
      }

      // Left-click on interactable — pathfind + interact (preserved behavior)
      const blocked = getPathfindingBlockers(state, tile)
      const resolved = resolveClickTarget(state, tile, blocked, refreshUI)
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
        updateCamera(state)
        state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, resolved.walkTarget, blocked, {
          allowDiagonal: true,
        })
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

      if (state.devPanelOpen) return
      if (activeScreenRef.current === 'system') return
      if (isDeepTimeLocked(state)) return
      if (isInputGated(state)) return
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
        state.viewportHeight
      )
      if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return

      // Right-click only commands selected NPC units. Without a selection,
      // it is a no-op — the player is not mouse-movable.
      if (!hasSelection(state)) return
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
  }, [canvasRef, state, metricsRef, setActiveScreen, refreshUI])
}
