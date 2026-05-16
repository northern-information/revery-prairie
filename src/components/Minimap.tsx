import { useEffect, useRef } from 'react'

import { getCharacterDefinition } from '@/engine/characters'
import { TILE_COLORS } from '@/engine/constants'
import { ComponentType } from '@/engine/ecs/types'
import { posKey } from '@/engine/position'
import { TileType, Zone } from '@/engine/types'
import { getLastVisibleSet, getTileVisibility, hasFogOfWar } from '@/engine/visibility'
import type { GameState, Tile } from '@/engine/types'
import type { TileVisibility } from '@/engine/visibility'

const MINIMAP_CSS_SIZE = 176

const PLAYER_MARKER_COLOR = '#ff69b4'
const VIEWPORT_RECT_COLOR = '#ff69b4'
const RUIN_FOOTPRINT_COLOR = '#A88B5A'
const UNEXPLORED_COLOR = '#000000'

const WATER_COLOR = '#3D6FA8'

const tileColor = (tile: Tile, state: GameState, x: number, y: number): string => {
  const key = posKey(x, y)
  if (state.currentZone === Zone.Overworld && (state.ponds.has(key) || state.rivers.has(key))) {
    return WATER_COLOR
  }
  return TILE_COLORS[tile.type]
}

const applyFogTint = (color: string, vis: TileVisibility): string => {
  if (vis === 'unexplored') return UNEXPLORED_COLOR
  if (vis === 'partiallyDiscovered') {
    // Dim memory — render at ~35% brightness against black
    return color + '59' // alpha 0x59 ≈ 35%
  }
  return color
}

const drawTileLayer = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  tilePx: number,
  visibleSet: Set<string> | null,
) => {
  const w = state.mapWidth
  const h = state.mapHeight
  const fogged = hasFogOfWar(state.currentZone)
  const fallbackVisible = visibleSet ?? new Set<string>()

  for (let y = 0; y < h; y++) {
    const row = state.map[y]
    for (let x = 0; x < w; x++) {
      const tileType = row[x].type
      // Skip space — let the parent bar show through.
      if (tileType === TileType.Space) continue
      const base = tileColor(row[x], state, x, y)
      if (!fogged) {
        ctx.fillStyle = base
        ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx)
        continue
      }
      const vis = getTileVisibility(state, x, y, fallbackVisible)
      if (vis === 'unexplored') {
        // Leave the background showing through
        continue
      }
      ctx.fillStyle = applyFogTint(base, vis)
      ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx)
    }
  }
}

const buildOverworldCache = (state: GameState, tilePx: number): HTMLCanvasElement | null => {
  const w = state.mapWidth
  const h = state.mapHeight
  if (w === 0 || h === 0) return null

  const offscreen = document.createElement('canvas')
  offscreen.width = w * tilePx
  offscreen.height = h * tilePx
  const ctx = offscreen.getContext('2d')
  if (!ctx) return null

  drawTileLayer(ctx, state, tilePx, null)
  return offscreen
}

const isTileExplored = (state: GameState, x: number, y: number, visibleSet: Set<string> | null): boolean => {
  if (!hasFogOfWar(state.currentZone)) return true
  const vis = getTileVisibility(state, x, y, visibleSet ?? new Set())
  return vis !== 'unexplored'
}

const drawStructures = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  tilePx: number,
  visibleSet: Set<string> | null,
) => {
  if (state.currentZone === Zone.Overworld) {
    ctx.fillStyle = RUIN_FOOTPRINT_COLOR
    for (const ruin of state.civilizationRuins) {
      for (const pos of ruin.buildingFootprints) {
        ctx.fillRect(pos.x * tilePx, pos.y * tilePx, tilePx, tilePx)
      }
    }
  }

  for (let y = 0; y < state.mapHeight; y++) {
    const row = state.map[y]
    for (let x = 0; x < state.mapWidth; x++) {
      const t = row[x].type
      if (t === TileType.CaveEntrance || t === TileType.RuinEntrance) {
        if (!isTileExplored(state, x, y, visibleSet)) continue
        ctx.fillStyle = TILE_COLORS[t]
        ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx)
      }
    }
  }

  const charEntities = state.world.query(
    ComponentType.Position,
    ComponentType.CharacterIdentity,
    ComponentType.EntityZone,
  )
  for (const e of charEntities) {
    const zone = state.world.getComponent(e, ComponentType.EntityZone)
    if (zone?.zone !== state.currentZone) continue
    const pos = state.world.getComponent(e, ComponentType.Position)
    if (!pos) continue
    // Hide characters in fogged zones unless their tile is currently visible
    if (hasFogOfWar(state.currentZone)) {
      const key = posKey(pos.x, pos.y)
      if (!visibleSet?.has(key)) continue
    }
    const ident = state.world.getComponent(e, ComponentType.CharacterIdentity)
    if (!ident) continue
    const def = getCharacterDefinition(ident.definitionId)
    ctx.fillStyle = def.glyphColor
    ctx.fillRect(pos.x * tilePx, pos.y * tilePx, tilePx, tilePx)
  }
}

const drawViewportRect = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  tilePx: number,
  canvasSize: number,
) => {
  const x = state.camera.x * tilePx
  const y = state.camera.y * tilePx
  const w = state.viewportWidth * tilePx
  const h = state.viewportHeight * tilePx

  const clampedX = Math.max(0, Math.min(canvasSize - 1, x))
  const clampedY = Math.max(0, Math.min(canvasSize - 1, y))
  const clampedW = Math.max(1, Math.min(canvasSize - clampedX, w - (clampedX - x)))
  const clampedH = Math.max(1, Math.min(canvasSize - clampedY, h - (clampedY - y)))

  ctx.strokeStyle = VIEWPORT_RECT_COLOR
  ctx.lineWidth = 1
  ctx.strokeRect(clampedX + 0.5, clampedY + 0.5, clampedW - 1, clampedH - 1)
}

const drawPlayerMarker = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  tilePx: number,
  canvasSize: number,
) => {
  const markerSize = Math.max(3, tilePx)
  const cx = state.player.x * tilePx + tilePx / 2
  const cy = state.player.y * tilePx + tilePx / 2
  const x = Math.max(0, Math.min(canvasSize - markerSize, Math.round(cx - markerSize / 2)))
  const y = Math.max(0, Math.min(canvasSize - markerSize, Math.round(cy - markerSize / 2)))
  ctx.fillStyle = PLAYER_MARKER_COLOR
  ctx.fillRect(x, y, markerSize, markerSize)
}

interface MinimapProps {
  state: GameState
}

export const Minimap = ({ state }: MinimapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overworldCacheRef = useRef<HTMLCanvasElement | null>(null)
  const cacheMapRef = useRef<Tile[][] | null>(null)
  const cacheTilePxRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = MINIMAP_CSS_SIZE
    canvas.height = MINIMAP_CSS_SIZE
    canvas.style.width = `${String(MINIMAP_CSS_SIZE)}px`
    canvas.style.height = `${String(MINIMAP_CSS_SIZE)}px`

    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (state.mapWidth === 0 || state.mapHeight === 0) return

      const longest = Math.max(state.mapWidth, state.mapHeight)
      const tilePx = Math.max(1, Math.floor(MINIMAP_CSS_SIZE / longest))

      ctx.clearRect(0, 0, MINIMAP_CSS_SIZE, MINIMAP_CSS_SIZE)

      const visibleSet = getLastVisibleSet()

      if (state.currentZone === Zone.Overworld) {
        const cacheStale =
          overworldCacheRef.current === null ||
          cacheMapRef.current !== state.map ||
          cacheTilePxRef.current !== tilePx
        if (cacheStale) {
          overworldCacheRef.current = buildOverworldCache(state, tilePx)
          cacheMapRef.current = state.map
          cacheTilePxRef.current = tilePx
        }
        const cache = overworldCacheRef.current
        if (cache) ctx.drawImage(cache, 0, 0)
      } else {
        // Fogged zones (Cave, Ruin) — repaint each frame so newly explored
        // tiles appear as the player walks.
        drawTileLayer(ctx, state, tilePx, visibleSet)
      }

      drawStructures(ctx, state, tilePx, visibleSet)

      const drawnSize = Math.max(state.mapWidth, state.mapHeight) * tilePx
      drawViewportRect(ctx, state, tilePx, drawnSize)
      drawPlayerMarker(ctx, state, tilePx, drawnSize)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [state])

  return (
    <canvas ref={canvasRef} data-testid="minimap-canvas" className="block" />
  )
}
