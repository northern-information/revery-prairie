import { useEffect } from 'react'

import { groundOmniboxBlockedSet } from '@/engine/actions'
import { screenToTile } from '@/engine/coordinates'
import { findPath } from '@/engine/pathfinding'
import { TileType } from '@/engine/types'
import type { Panel } from './useKeyboard'
import type { CharMetrics } from '@/engine/renderer'
import type { GameState } from '@/engine/types'

interface UseMouseOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  state: GameState
  metricsRef: React.RefObject<CharMetrics | null>
  activePanel: Panel
}

export const useMouse = ({ canvasRef, state, metricsRef, activePanel }: UseMouseOptions) => {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleClick = (e: MouseEvent) => {
      if (activePanel === 'menu') return
      const metrics = metricsRef.current
      if (!metrics) return

      const tile = screenToTile(e.offsetX, e.offsetY, state.camera, metrics.charWidth, metrics.charHeight)

      if (tile.x < 0 || tile.x >= state.mapWidth || tile.y < 0 || tile.y >= state.mapHeight) return

      if (state.map[tile.y][tile.x].type === TileType.Space) return
      if (tile.x === state.player.x && tile.y === state.player.y) return

      state.pendingAction = null
      state.previewFn = null
      const blocked = groundOmniboxBlockedSet(state)
      state.path = findPath(state.map, state.mapWidth, state.mapHeight, state.player, tile, blocked)
    }

    canvas.addEventListener('click', handleClick)
    return () => {
      canvas.removeEventListener('click', handleClick)
    }
  }, [canvasRef, state, metricsRef, activePanel])
}
