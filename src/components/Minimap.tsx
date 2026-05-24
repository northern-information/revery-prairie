import { useEffect, useRef } from 'react'
import { computeIsoLayout, getPlayerCenter, MINIMAP_CSS_SIZE, projectIso } from './minimapProjection'
import { getVisibleRuinFootprints, isTileExplored } from './minimapStructures'

import { getCharacterDefinition } from '@/engine/characters'
import { TILE_COLORS } from '@/engine/constants'
import { ComponentType } from '@/engine/ecs/types'
import { posKey } from '@/engine/position'
import { TileType, Zone } from '@/engine/types'
import { getLastVisibleSet, getTileVisibility, hasFogOfWar } from '@/engine/visibility'
import type { IsoLayout } from './minimapProjection'
import type { GameState, Tile } from '@/engine/types'
import type { TileVisibility } from '@/engine/visibility'

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

const drawIsoTile = (
  ctx: CanvasRenderingContext2D,
  layout: IsoLayout,
  worldX: number,
  worldY: number,
  color: string
) => {
  const { px, py } = projectIso(worldX, worldY, layout)
  const w = layout.tilePx * 2
  const h = layout.tilePx
  ctx.fillStyle = color
  ctx.fillRect(Math.round(px - layout.tilePx), Math.round(py), w, h)
}

const drawTileLayer = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: IsoLayout,
  visibleSet: Set<string> | null
) => {
  const w = state.mapWidth
  const h = state.mapHeight
  const fogged = hasFogOfWar(state.currentZone)
  const fallbackVisible = visibleSet ?? new Set<string>()

  for (let y = 0; y < h; y++) {
    const row = state.map[y]
    for (let x = 0; x < w; x++) {
      const tileType = row[x].type
      if (tileType === TileType.Space) continue
      const base = tileColor(row[x], state, x, y)
      if (!fogged) {
        drawIsoTile(ctx, layout, x, y, base)
        continue
      }
      const vis = getTileVisibility(state, x, y, fallbackVisible)
      if (vis === 'unexplored') {
        continue
      }
      drawIsoTile(ctx, layout, x, y, applyFogTint(base, vis))
    }
  }
}

const buildOverworldCache = (state: GameState, layout: IsoLayout): HTMLCanvasElement | null => {
  if (state.mapWidth === 0 || state.mapHeight === 0) return null

  const offscreen = document.createElement('canvas')
  offscreen.width = MINIMAP_CSS_SIZE
  offscreen.height = MINIMAP_CSS_SIZE
  const ctx = offscreen.getContext('2d')
  if (!ctx) return null

  drawTileLayer(ctx, state, layout, null)
  return offscreen
}

const drawStructures = (
  ctx: CanvasRenderingContext2D,
  state: GameState,
  layout: IsoLayout,
  visibleSet: Set<string> | null
) => {
  for (const pos of getVisibleRuinFootprints(state, visibleSet)) {
    drawIsoTile(ctx, layout, pos.x, pos.y, RUIN_FOOTPRINT_COLOR)
  }

  for (let y = 0; y < state.mapHeight; y++) {
    const row = state.map[y]
    for (let x = 0; x < state.mapWidth; x++) {
      const t = row[x].type
      if (t === TileType.CaveEntrance || t === TileType.RuinEntrance) {
        if (!isTileExplored(state, x, y, visibleSet)) continue
        drawIsoTile(ctx, layout, x, y, TILE_COLORS[t])
      }
    }
  }

  const charEntities = state.world.query(
    ComponentType.Position,
    ComponentType.CharacterIdentity,
    ComponentType.EntityZone
  )
  for (const e of charEntities) {
    const zone = state.world.getComponent(e, ComponentType.EntityZone)
    if (zone?.zone !== state.currentZone) continue
    const pos = state.world.getComponent(e, ComponentType.Position)
    if (!pos) continue
    if (hasFogOfWar(state.currentZone)) {
      const key = posKey(pos.x, pos.y)
      if (!visibleSet?.has(key)) continue
    }
    const ident = state.world.getComponent(e, ComponentType.CharacterIdentity)
    if (!ident) continue
    const def = getCharacterDefinition(ident.definitionId)
    drawIsoTile(ctx, layout, pos.x, pos.y, def.glyphColor)
  }
}

const drawViewportRect = (ctx: CanvasRenderingContext2D, state: GameState, layout: IsoLayout) => {
  if (layout.tilePx === 0) return
  const { cx, cy } = getPlayerCenter(state, layout)
  const w = state.viewportWidth * layout.tilePx
  const h = state.viewportHeight * layout.tilePx
  const halfW = w / 2
  const halfH = h / 2
  let x = cx - halfW
  let y = cy - halfH
  let drawW = w
  let drawH = h
  if (x < 0) {
    drawW = Math.max(1, w + x)
    x = 0
  }
  if (y < 0) {
    drawH = Math.max(1, h + y)
    y = 0
  }
  if (x + drawW > MINIMAP_CSS_SIZE) drawW = Math.max(1, MINIMAP_CSS_SIZE - x)
  if (y + drawH > MINIMAP_CSS_SIZE) drawH = Math.max(1, MINIMAP_CSS_SIZE - y)
  ctx.strokeStyle = VIEWPORT_RECT_COLOR
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(drawW) - 1, Math.round(drawH) - 1)
}

const drawPlayerMarker = (ctx: CanvasRenderingContext2D, state: GameState, layout: IsoLayout) => {
  const markerSize = Math.max(3, layout.tilePx)
  const { cx, cy } = getPlayerCenter(state, layout)
  const x = Math.max(0, Math.min(MINIMAP_CSS_SIZE - markerSize, Math.round(cx - markerSize / 2)))
  const y = Math.max(0, Math.min(MINIMAP_CSS_SIZE - markerSize, Math.round(cy - markerSize / 2)))
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

      const layout = computeIsoLayout(state.mapWidth, state.mapHeight)

      ctx.clearRect(0, 0, MINIMAP_CSS_SIZE, MINIMAP_CSS_SIZE)

      const visibleSet = getLastVisibleSet()

      if (state.currentZone === Zone.Overworld) {
        const cacheStale =
          overworldCacheRef.current === null ||
          cacheMapRef.current !== state.map ||
          cacheTilePxRef.current !== layout.tilePx
        if (cacheStale) {
          overworldCacheRef.current = buildOverworldCache(state, layout)
          cacheMapRef.current = state.map
          cacheTilePxRef.current = layout.tilePx
        }
        const cache = overworldCacheRef.current
        if (cache) ctx.drawImage(cache, 0, 0)
      } else {
        drawTileLayer(ctx, state, layout, visibleSet)
      }

      drawStructures(ctx, state, layout, visibleSet)
      drawViewportRect(ctx, state, layout)
      drawPlayerMarker(ctx, state, layout)
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [state])

  return <canvas ref={canvasRef} data-testid="minimap-canvas" className="block" />
}
