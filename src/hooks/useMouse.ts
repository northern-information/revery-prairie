import { useEffect, useRef } from 'react'

import { getBlockedPositions, interactWithCharacter, openOmnibox, updateFacingEntity } from '@/engine/actions'
import { getCharacterDefinition } from '@/engine/characters'
import { screenToTile } from '@/engine/coordinates'
import { findPath } from '@/engine/pathfinding'
import { posKey } from '@/engine/position'
import { TileType } from '@/engine/types'
import type { Panel } from './useKeyboard'
import type { CharMetrics } from '@/engine/renderer'
import type { GameState } from '@/engine/types'

interface UseMouseOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  state: GameState
  metricsRef: React.RefObject<CharMetrics | null>
  activePanel: Panel
  setActivePanel: (panel: Panel) => void
  refreshUI: () => void
  onDialog: (characterName: string, glyph: string, glyphColor: string, worldX: number, worldY: number) => void
}

export const useMouse = ({
  canvasRef,
  state,
  metricsRef,
  activePanel,
  setActivePanel,
  refreshUI,
  onDialog,
}: UseMouseOptions) => {
  const activePanelRef = useRef(activePanel)
  activePanelRef.current = activePanel

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleClick = (e: MouseEvent) => {
      if (activePanelRef.current === 'menu') return
      if (state.activeDialog) {
        state.activeDialog = null
        refreshUI()
        return
      }
      const metrics = metricsRef.current
      if (!metrics) return

      const tile = screenToTile(e.offsetX, e.offsetY, state.camera, metrics.charWidth, metrics.charHeight)

      if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return

      if (state.map[tile.y][tile.x].type === TileType.Space) return
      if (tile.x === state.player.x && tile.y === state.player.y) return

      const blocked = getBlockedPositions(state)

      const adjacentDeltas = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ]

      // Resolve click target and pending action based on what was clicked
      let walkTarget = tile
      let action: (() => void) | null = null

      const clickedCharacter = state.characters.find(c => c.pos.x === tile.x && c.pos.y === tile.y)
      const clickedOmnibox = state.groundOmniboxes.find(go => go.pos.x === tile.x && go.pos.y === tile.y)

      if (clickedCharacter || clickedOmnibox) {
        // Find closest adjacent walkable tile to the entity
        let bestTarget: { x: number; y: number } | null = null
        let bestDist = Infinity
        for (const d of adjacentDeltas) {
          const ax = tile.x + d.x
          const ay = tile.y + d.y
          if (ax < 0 || ax >= state.mapWidth || ay < 0 || ay >= state.mapHeight) continue
          if (state.map[ay][ax].type === TileType.Space) continue
          if (blocked.has(posKey(ax, ay))) continue
          const dist = Math.abs(ax - state.player.x) + Math.abs(ay - state.player.y)
          if (dist < bestDist) {
            bestDist = dist
            bestTarget = { x: ax, y: ay }
          }
        }
        if (!bestTarget) return
        walkTarget = bestTarget

        if (clickedCharacter) {
          const charDef = getCharacterDefinition(clickedCharacter.definitionId)
          action = () => {
            interactWithCharacter(state)
            onDialog(charDef.name, charDef.glyph, charDef.glyphColor, state.player.x, state.player.y)
            refreshUI()
          }
        } else if (clickedOmnibox) {
          const omniboxUid = clickedOmnibox.uid
          action = () => {
            openOmnibox(state, omniboxUid)
            updateFacingEntity(state)
            setActivePanel('inventory')
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
      state.previewFn = null
      state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, walkTarget, blocked)
      state.pathWaypoints = state.path ? [walkTarget] : []
    }

    canvas.addEventListener('click', handleClick)
    return () => {
      canvas.removeEventListener('click', handleClick)
    }
  }, [canvasRef, state, metricsRef, setActivePanel, refreshUI, onDialog])
}
