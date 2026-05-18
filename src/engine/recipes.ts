import { ACTION_COLOR } from './constants'
import { setMapTile } from './map'
import { spawnBeeOrMonarch } from './monarch'
import { isInBounds, posKey } from './position'
import { FloraSpecies, FloraStage, TileType } from './types'

import type { GameState, Position } from './types'

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
    preview: state => {
      const tiles: PreviewTile[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = state.player.x + dx
          const ty = state.player.y + dy
          if (isInBounds(tx, ty, state.mapWidth, state.mapHeight)) {
            const t = state.map[ty][tx].type
            const k = posKey(tx, ty)
            const isWater = state.ponds.has(k) || state.rivers.has(k)
            if (!isWater && (t === TileType.Dirt || t === TileType.Flora || t === TileType.CaveFloor)) {
              tiles.push({ pos: { x: tx, y: ty }, char: '#', color: ACTION_COLOR, isValid: true })
            }
          }
        }
      }
      return tiles
    },
    execute: state => {
      const standingOn = state.map[state.player.y][state.player.x].type
      const standingKey = posKey(state.player.x, state.player.y)
      const standingOnWater = state.ponds.has(standingKey) || state.rivers.has(standingKey)
      if (
        standingOnWater ||
        (standingOn !== TileType.Dirt && standingOn !== TileType.Flora && standingOn !== TileType.CaveFloor)
      )
        return false

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = state.player.x + dx
          const ty = state.player.y + dy
          if (isInBounds(tx, ty, state.mapWidth, state.mapHeight)) {
            const t = state.map[ty][tx].type
            const k = posKey(tx, ty)
            const isWater = state.ponds.has(k) || state.rivers.has(k)
            if (!isWater && (t === TileType.Dirt || t === TileType.Flora || t === TileType.CaveFloor)) {
              // Bee + clover seeds Flora tiles as clover specifically.
              setMapTile(state, tx, ty, { type: TileType.Flora })
              state.floraLifecycle.set(k, {
                stage: FloraStage.Healthy,
                stageStartTime: 0,
                hasLight: true,
                species: FloraSpecies.Clover,
              })
            }
          }
        }
      }

      spawnBeeOrMonarch(state, state.player.x, state.player.y)
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
