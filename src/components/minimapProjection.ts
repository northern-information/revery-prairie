import type { GameState } from '@/engine/types'

export const MINIMAP_CSS_SIZE = 176

export interface IsoLayout {
  tilePx: number
  originX: number
  originY: number
}

// cssSize defaults to the minimap's 176px square. RP-70's map tab passes
// a larger size for a readable, reduced-pitch chart; the iso math is
// identical, only the scale differs. Minimap's call is unchanged.
export const computeIsoLayout = (mapWidth: number, mapHeight: number, cssSize: number = MINIMAP_CSS_SIZE): IsoLayout => {
  if (mapWidth === 0 || mapHeight === 0) {
    return { tilePx: 0, originX: 0, originY: 0 }
  }
  const widthUnits = mapWidth + mapHeight
  const tilePx = cssSize / widthUnits
  const drawnWidth = widthUnits * tilePx
  const drawnHeight = drawnWidth / 2
  const originX = (cssSize - drawnWidth) / 2 + mapHeight * tilePx
  const originY = (cssSize - drawnHeight) / 2
  return { tilePx, originX, originY }
}

export const projectIso = (worldX: number, worldY: number, layout: IsoLayout): { px: number; py: number } => ({
  px: layout.originX + (worldX - worldY) * layout.tilePx,
  py: layout.originY + (worldX + worldY) * (layout.tilePx / 2),
})

export const getPlayerCenter = (state: GameState, layout: IsoLayout): { cx: number; cy: number } => {
  const { px, py } = projectIso(state.player.x, state.player.y, layout)
  return { cx: px, cy: py + layout.tilePx / 2 }
}
