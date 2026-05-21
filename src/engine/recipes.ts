import { ACTION_COLOR, CEREMONY_WAVE_RADIUS } from './constants'
import { sha256Sync } from './crypto'
import { FLORA_SPECIES } from './flora/species'
import { createFloraLifecycleEntry } from './floraLifecycleEntry'
import { generateRuntimeIdentity, generateTraitBag } from './genetics'
import { setMapTile } from './map'
import { spawnBeeOrMonarch } from './monarch'
import { isInBounds, posKey } from './position'
import { FloraSpecies, TileType } from './types'

import type { GameState, Position, WaveEmission } from './types'

export interface PreviewTile {
  pos: Position
  char: string
  color: string
  isValid: boolean
}

export const RecipeKind = {
  Macro: 'macro',
  Craft: 'craft',
} as const

export type RecipeKind = (typeof RecipeKind)[keyof typeof RecipeKind]

export interface Recipe {
  ingredients: [string, string]
  kind: RecipeKind
  resultName: string
  resultIcon?: string
  preview?: (state: GameState) => PreviewTile[]
  execute: (state: GameState) => boolean
}

export const RECIPES: Recipe[] = [
  {
    ingredients: ['bee', 'clover'],
    kind: RecipeKind.Macro,
    resultName: 'Prairie',
    // Precis #17 — preview shows the single seed tile at the player.
    // The full radial wave isn't previewed; it unfolds over the next
    // several seconds via tickFloraWaves and is meant to surprise.
    preview: state => {
      const tx = state.player.x
      const ty = state.player.y
      if (!isInBounds(tx, ty, state.mapWidth, state.mapHeight)) return []
      const t = state.map[ty][tx].type
      const k = posKey(tx, ty)
      const isWater = state.ponds.has(k) || state.rivers.has(k)
      if (isWater) return []
      if (t !== TileType.Dirt && t !== TileType.Flora && t !== TileType.CaveFloor) return []
      return [{ pos: { x: tx, y: ty }, char: '#', color: ACTION_COLOR, isValid: true }]
    },
    // Precis #17 — bee+clover is now a ceremonial radial wave, not a
    // 3x3 stamp. The combine places one clover seed at the player and
    // enqueues a WaveEmission that paints ~150 tiles over the next
    // several CEREMONY_WAVE_TICK_MS frames. The seedIdentity flows to
    // every painted tile as its lineage parent, so the whole grove
    // shares a family-resemblance prefix.
    execute: state => {
      const standingOn = state.map[state.player.y][state.player.x].type
      const standingKey = posKey(state.player.x, state.player.y)
      const standingOnWater = state.ponds.has(standingKey) || state.rivers.has(standingKey)
      if (
        standingOnWater ||
        (standingOn !== TileType.Dirt && standingOn !== TileType.Flora && standingOn !== TileType.CaveFloor)
      )
        return false

      const cx = state.player.x
      const cy = state.player.y
      const time = Date.now()
      const seedIdentity = sha256Sync(`ceremony:${FloraSpecies.Clover}:${posKey(cx, cy)}:${String(time)}`)

      // Place the single seed clover at the player position. Use
      // generateRuntimeIdentity (not the seedIdentity) so this first
      // tile's identity is well-formed for the trait bag; descendants
      // painted by the wave will derive from seedIdentity via
      // applyParentLineage.
      const binomial = FLORA_SPECIES[FloraSpecies.Clover].latinBinomial
      const seedTileIdentity = generateRuntimeIdentity(binomial, standingKey, time)
      setMapTile(state, cx, cy, { type: TileType.Flora })
      state.floraLifecycle.set(
        standingKey,
        createFloraLifecycleEntry({
          time: 0,
          hasLight: true,
          species: FloraSpecies.Clover,
          identity: seedTileIdentity,
          traits: generateTraitBag(seedTileIdentity),
        }),
      )

      const wave: WaveEmission = {
        seedIdentity,
        cx,
        cy,
        currentRadius: 0,
        maxRadius: CEREMONY_WAVE_RADIUS,
        // lastTickTime set to time - CEREMONY_WAVE_TICK_MS so the first
        // tick fires immediately on the next tickFloraWaves call rather
        // than waiting a full interval. Reading more honest than the
        // alternative of `0` which would still work but look stale.
        lastTickTime: 0,
      }
      state.activeWaves.push(wave)

      spawnBeeOrMonarch(state, cx, cy)
      // Note: event:ceremony-cast discovery is recorded by the
      // combine/drag layer (which already imports manual.ts) — keeping
      // it out of recipes.ts avoids the recipes ↔ manual circular import.
      return true
    },
  },
]

const STEWARD_SEAL_RECIPE: [string, string] = ['bee', 'clover']

export const isStewardSealRecipe = (recipe: Recipe): boolean => {
  const [a, b] = recipe.ingredients
  return (
    (a === STEWARD_SEAL_RECIPE[0] && b === STEWARD_SEAL_RECIPE[1]) ||
    (a === STEWARD_SEAL_RECIPE[1] && b === STEWARD_SEAL_RECIPE[0])
  )
}

export const recipeKey = (recipe: Recipe): string => {
  const sorted = [...recipe.ingredients].sort((a, b) => a.localeCompare(b))
  return sorted.join('+')
}

export const combineIcon = (recipe: Recipe, isDiscovered: boolean): string => {
  if (!isDiscovered) return '?'
  if (recipe.kind === RecipeKind.Craft && recipe.resultIcon) return recipe.resultIcon
  return '!'
}

export const findRecipe = (a: string, b: string): Recipe | null => {
  for (const recipe of RECIPES) {
    const [i1, i2] = recipe.ingredients
    if ((a === i1 && b === i2) || (a === i2 && b === i1)) {
      return recipe
    }
  }
  return null
}
