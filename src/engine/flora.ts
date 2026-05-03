import { TileType } from '@/engine/types'

/**
 * Tile types that receive wind-driven sway animation.
 * Add new flora tile types here to opt them in.
 */
export const WEATHER_AFFECTED_TILES = new Set<(typeof TileType)[keyof typeof TileType]>([
  TileType.Clover,
])
