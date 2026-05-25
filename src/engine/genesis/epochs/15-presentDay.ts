import {
  BURN_SCAR_COLORS as GAME_BURN_SCAR_COLORS,
  DIRT_COLORS as GAME_DIRT_COLORS,
  POND_COLOR,
  RIVER_COLOR,
  SAND_COLORS,
  SOIL_HEALTH_MAX,
  TILE_CHARS,
  TILE_COLORS,
} from '../../constants'
import { GenesisEpochId } from '../../genesisTypes'
import { posKey, tileHash as rendererTileHash } from '../../position'
import { TileType } from '../../types'
import { BUILDING_CHARS, clamp, CRATER_COLORS, enforceConnectivity } from '../shared'

import type { GenesisEpoch, GenesisTileRender } from '../../genesisTypes'

export const presentDay: GenesisEpoch = {
  id: GenesisEpochId.PresentDay,
  durationMs: 2000,
  mutate: sim => {
    // Clamp all soil health to [10, 100]
    for (const [key, value] of sim.soilHealth) {
      sim.soilHealth.set(key, clamp(value, 10, SOIL_HEALTH_MAX))
    }

    // Ensure all land tiles have soil health
    for (const key of sim.landMask) {
      if (!sim.soilHealth.has(key)) {
        sim.soilHealth.set(key, 30)
      }
    }

    // Clamp all elevation to [0, 100]
    for (const [key, value] of sim.elevation) {
      sim.elevation.set(key, clamp(value, 0, 100))
    }

    // Ensure all land tiles have elevation
    for (const key of sim.landMask) {
      if (!sim.elevation.has(key)) {
        sim.elevation.set(key, 50)
      }
    }

    // Remove disconnected walkable islands unreachable from player spawn
    enforceConnectivity(sim)
  },
  renderTile: (sim, x, y, _progress, time) => {
    // Use rendererTileHash (from position.ts) — the same hash function the
    // game renderer keys terrain colors with. Local genesis tileHash and
    // rendererTileHash mix bits differently, so using local would shift
    // every sand/dirt/burn-scar/crater tile's palette index at the
    // genesis-to-game handoff. Stars and rain aura already used
    // rendererTileHash directly.
    const h = rendererTileHash(x, y)
    const tile = sim.grid[y]?.[x]

    // Stars — use rendererTileHash to match game renderer exactly
    if (!tile || tile.type === TileType.Space) {
      const STAR_CHARS = ['.', '+', '*']
      const STAR_COLORS = ['#333', '#555', '#777', '#999', '#bbb', '#999', '#777', '#555']
      const starH = rendererTileHash(x, y)
      if (starH % 12 === 0) {
        const phase = (starH >> 8) % STAR_COLORS.length
        const colorIndex = (phase + Math.floor(time * 0.0015)) % STAR_COLORS.length
        return [{ char: STAR_CHARS[(starH >> 4) % STAR_CHARS.length], color: STAR_COLORS[colorIndex], dx: 0, dy: 0 }]
      }
      return [{ char: ' ', color: '#000', dx: 0, dy: 0 }]
    }

    const key = posKey(x, y)

    // Rivers and ponds checked before Sand — matches game renderer priority
    // (game renderer checks state.rivers/ponds before tile.type). Water tiles
    // can sit on Sand grid tiles due to shoreline generation.
    if (sim.riverPaths.has(key)) {
      const waterChars = ['~', '=', '-']
      const ci = (h + Math.floor(time * 0.004)) % waterChars.length
      return [{ char: waterChars[ci], color: RIVER_COLOR, dx: 0, dy: 0 }]
    }

    if (sim.ponds.has(key)) {
      const waterChars = ['~', '=']
      const ci = (h + Math.floor(time * 0.003)) % waterChars.length
      return [{ char: waterChars[ci], color: POND_COLOR, dx: 0, dy: 0 }]
    }

    // Sand — match game renderer's multi-color palette
    if (tile.type === TileType.Sand) {
      return [{ char: ':', color: SAND_COLORS[h % SAND_COLORS.length], dx: 0, dy: 0 }]
    }

    // Ruin and cave entrances — match the game renderer so the glyph and
    // color are continuous across the genesis-to-game handoff. The 3x3
    // dark halo backdrop behind RuinEntrance is painted in a separate
    // pre-pass in genesisRenderer.ts.
    if (tile.type === TileType.RuinEntrance) {
      return [{ char: 'O', color: TILE_COLORS[TileType.RuinEntrance], dx: 0, dy: 0 }]
    }
    if (tile.type === TileType.CaveEntrance) {
      return [{ char: 'O', color: TILE_COLORS[TileType.CaveEntrance], dx: 0, dy: 0 }]
    }

    // Gron is intentionally absent from genesis presentDay — he and
    // the player both arrive after the boot title card lifts.

    // Base terrain — craters take priority over burn scars and dirt so
    // post-impact craters render in their resting brown matching
    // renderer.ts (state.craters branch). All three branches key off
    // rendererTileHash via `h`, matching the game renderer exactly. The
    // fallOfCivilizations -> presentDay crossfade smoothly blends red
    // SATELLITE_TRAIL_COLORS into this brown.
    // Use TILE_CHARS[Dirt] ('·') so burn-scar / plain-dirt glyphs match
    // gameplay byte-for-byte; previously this rendered '.' here and game
    // rendered '·', producing a per-tile char swap at the handoff.
    const dirtChar = TILE_CHARS[TileType.Dirt]
    const baseTile: GenesisTileRender = sim.craters.has(key)
      ? {
          char: BUILDING_CHARS[h % BUILDING_CHARS.length],
          color: CRATER_COLORS[h % CRATER_COLORS.length],
          dx: 0,
          dy: 0,
        }
      : sim.burnScars.has(key)
        ? { char: dirtChar, color: GAME_BURN_SCAR_COLORS[h % GAME_BURN_SCAR_COLORS.length], dx: 0, dy: 0 }
        : { char: dirtChar, color: GAME_DIRT_COLORS[h % GAME_DIRT_COLORS.length], dx: 0, dy: 0 }

    // No Gron rain aura in genesis — the aura returns in gameplay when
    // Gron and the player both arrive after the boot title card.

    return [baseTile]
  },
}
