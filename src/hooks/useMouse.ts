import { useEffect, useRef } from 'react'

import { updateCamera } from '@/engine/camera'
import { expandClickTile } from '@/engine/clickResolution'
import { screenToTile } from '@/engine/coordinates'
import { isDeepTimeLocked } from '@/engine/deepTime'
import { ComponentType } from '@/engine/ecs/types'
import { spawnClickTarget } from '@/engine/effects'
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
import { TileType } from '@/engine/types'
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
  setActiveScreen: _setActiveScreen,
  refreshUI,
}: UseMouseOptions) => {
  const activeScreenRef = useRef(activeScreen)
  activeScreenRef.current = activeScreen

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleClick = (e: MouseEvent) => {
      // Skip the remaining genesis epochs on any canvas click.
      if (state.genesis && state.genesis.epochIndex < GENESIS_EPOCHS.length) {
        completeGenesis(state)
        refreshUI()
        return
      }

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

      const tile = expandClickTile(state, rawTile)

      // Click on the player tile — no-op
      if (tile.x === state.player.x && tile.y === state.player.y) return

      // Left-click never moves the player. The only interaction left-click
      // can trigger is "execute interaction immediately when adjacent" — e.g.
      // standing next to a character and left-clicking them advances dialog
      // without any pathfinding. Far interactables are no-ops; the player
      // walks over via right-click and then presses the interact key.
      const blocked = getPathfindingBlockers(state, tile)
      const resolved = resolveClickTarget(state, tile, blocked, refreshUI)
      if (resolved?.action == null) return
      if (resolved.walkTarget.x !== state.player.x || resolved.walkTarget.y !== state.player.y) return
      resolved.action()
      refreshUI()
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()

      if (activeScreenRef.current === 'system') return
      if (isDeepTimeLocked(state)) return
      if (isInputGated(state)) return
      if (state.activeDialog) return

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
      if (!isWalkableTile(state.map[rawTile.y][rawTile.x].type)) return
      if (rawTile.x === state.player.x && rawTile.y === state.player.y) return

      const target = { x: rawTile.x, y: rawTile.y }
      const blocked = getPathfindingBlockers(state, target)

      // Shift + right-click chains the new tile onto the existing path as
      // a queued waypoint (RTS-style). Without an existing path, shift
      // behaves the same as a plain right-click.
      const canChain =
        e.shiftKey && state.path !== null && state.path.length > 0 && state.pathWaypoints.length > 0
      if (canChain) {
        const lastWaypoint = state.pathWaypoints[state.pathWaypoints.length - 1]
        if (lastWaypoint.x === target.x && lastWaypoint.y === target.y) return
        const appended = findPath(state.map, state.mapWidth, state.mapHeight, lastWaypoint, target, blocked, {
          allowDiagonal: true,
        })
        if (!appended || appended.length === 0) return
        state.path = [...(state.path ?? []), ...appended]
        state.pathWaypoints = [...state.pathWaypoints, target]
        spawnClickTarget(state, target.x, target.y, performance.now())
        refreshUI()
        return
      }

      state.pendingAction = null
      state.pendingInteractionTarget = null
      state.previewFn = null
      updateCamera(state)
      state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, target, blocked, {
        allowDiagonal: true,
      })
      state.pathWaypoints = state.path ? [target] : []
      if (state.path) spawnClickTarget(state, target.x, target.y, performance.now())
      refreshUI()
    }

    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => {
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [canvasRef, state, metricsRef, refreshUI])
}
