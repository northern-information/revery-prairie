import { useEffect, useRef } from 'react'

import { groundOmniboxBlockedSet, interactWithCharacter, openOmnibox, updateFacingOmnibox } from '@/engine/actions'
import { characterBlockedSet, getCharacterDefinition } from '@/engine/characters'
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

      // Check if clicked tile has a character — walk adjacent then interact
      const clickedCharacter = state.characters.find(c => c.pos.x === tile.x && c.pos.y === tile.y)
      if (clickedCharacter) {
        // Find closest adjacent walkable tile to the character
        const adjacentDeltas = [
          { x: 0, y: -1 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
          { x: 1, y: 0 },
        ]
        const charBlocked = characterBlockedSet(state.characters)
        const omniboxBlocked = groundOmniboxBlockedSet(state)
        const blocked = new Set([...charBlocked, ...omniboxBlocked])

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

        const charDef = getCharacterDefinition(clickedCharacter.definitionId)

        // If already adjacent, interact immediately
        if (bestTarget.x === state.player.x && bestTarget.y === state.player.y) {
          interactWithCharacter(state)
          onDialog(charDef.name, charDef.glyph, charDef.glyphColor, state.player.x, state.player.y)
          refreshUI()
          return
        }

        state.pendingAction = () => {
          interactWithCharacter(state)
          onDialog(charDef.name, charDef.glyph, charDef.glyphColor, state.player.x, state.player.y)
          refreshUI()
        }
        state.previewFn = null
        state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, bestTarget, blocked)
        return
      }

      // Check if clicked tile has a ground omnibox — walk adjacent then open
      const clickedOmnibox = state.groundOmniboxes.find(go => go.pos.x === tile.x && go.pos.y === tile.y)
      if (clickedOmnibox) {
        const adjacentDeltas = [
          { x: 0, y: -1 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
          { x: 1, y: 0 },
        ]
        const charBlocked = characterBlockedSet(state.characters)
        const omniboxBlocked = groundOmniboxBlockedSet(state)
        const blocked = new Set([...charBlocked, ...omniboxBlocked])

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

        const omniboxUid = clickedOmnibox.uid

        // If already adjacent, open immediately
        if (bestTarget.x === state.player.x && bestTarget.y === state.player.y) {
          openOmnibox(state, omniboxUid)
          updateFacingOmnibox(state)
          setActivePanel('inventory')
          refreshUI()
          return
        }

        state.pendingAction = () => {
          openOmnibox(state, omniboxUid)
          updateFacingOmnibox(state)
          setActivePanel('inventory')
          refreshUI()
        }
        state.previewFn = null
        state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, bestTarget, blocked)
        return
      }

      state.pendingAction = null
      state.previewFn = null
      const charBlocked = characterBlockedSet(state.characters)
      const omniboxBlocked = groundOmniboxBlockedSet(state)
      const blocked = new Set([...charBlocked, ...omniboxBlocked])
      state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, tile, blocked)
    }

    canvas.addEventListener('click', handleClick)
    return () => {
      canvas.removeEventListener('click', handleClick)
    }
  }, [canvasRef, state, metricsRef, setActivePanel, refreshUI, onDialog])
}
