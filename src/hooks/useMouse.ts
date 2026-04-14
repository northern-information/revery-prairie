import { useEffect, useRef } from 'react'

import { castLightningAtTarget, isValidLightningTarget } from '@/engine/actionBar'
import { getCharacterDefinition } from '@/engine/characters'
import { screenToTile } from '@/engine/coordinates'
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
import { TileType } from '@/engine/types'
import type { PermacomputerScreen } from './useKeyboard'
import type { CharMetrics, GameState } from '@/engine/types'

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

    const handleClick = (e: MouseEvent) => {
      if (state.devPanelOpen) return
      if (activeScreenRef.current === 'system') return

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
      const metrics = metricsRef.current
      if (!metrics) return

      const tile = screenToTile(e.offsetX, e.offsetY, state.camera, metrics.charWidth, metrics.charHeight)

      if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return

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
      let walkTarget = tile
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
      if (state.targetingSlot !== null) {
        e.preventDefault()
        state.targetingSlot = null
        state.previewFn = null
        refreshUI()
      }
    }

    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => {
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [canvasRef, state, metricsRef, setActiveScreen, refreshUI, onDialog, onDiscovery, onGift])
}
