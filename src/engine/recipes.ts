import { TileType } from './types'

import type { GameState, Position } from './types'

export interface PreviewTile {
  pos: Position
  char: string
  color: string
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
  description: string
  preview?: (state: GameState) => PreviewTile[]
  execute: (state: GameState) => boolean
}

export const RECIPES: Recipe[] = [
  {
    ingredients: ['bee', 'clover'],
    kind: RecipeKind.Macro,
    resultName: 'prairie',
    description: [
      'to make a prairie it takes a clover and one bee,',
      'one clover, and a bee.',
      '',
      'and revery.',
      'the revery alone will do,',
      'if bees are few.',
      '',
      '— emily dickinson, 1755',
    ].join('\n'),
    preview: state => {
      const tiles: PreviewTile[] = []
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = state.player.x + dx
          const ty = state.player.y + dy
          if (tx >= 0 && tx < state.mapWidth && ty >= 0 && ty < state.mapHeight) {
            const tile = state.map[ty][tx]
            if (tile.type !== TileType.Sand && tile.type !== TileType.Space) {
              tiles.push({ pos: { x: tx, y: ty }, char: '#', color: '#ff69b4' })
            }
          }
        }
      }
      return tiles
    },
    execute: state => {
      const standingOn = state.map[state.player.y][state.player.x].type
      if (standingOn === TileType.Sand || standingOn === TileType.Space) return false

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = state.player.x + dx
          const ty = state.player.y + dy
          if (tx >= 0 && tx < state.mapWidth && ty >= 0 && ty < state.mapHeight) {
            const tile = state.map[ty][tx]
            if (tile.type !== TileType.Sand && tile.type !== TileType.Space) {
              state.map[ty][tx] = { type: TileType.Clover }
            }
          }
        }
      }

      state.bees.push({ pos: { x: state.player.x, y: state.player.y } })
      return true
    },
  },
]

export const recipeKey = (recipe: Recipe): string => {
  const sorted = [...recipe.ingredients].sort()
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
