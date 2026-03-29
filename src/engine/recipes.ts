import { ComponentType } from './ecs'
import { createOmniboxContainer, findFitPosition, placeItem } from './inventory'
import { isInBounds } from './position'
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
  preserveIngredient?: string // definitionId of the ingredient to keep after combining
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
          if (isInBounds(tx, ty, state.mapWidth, state.mapHeight)) {
            const tile = state.map[ty][tx]
            if (
              tile.type !== TileType.Sand &&
              tile.type !== TileType.Space &&
              tile.type !== TileType.CaveEntrance
            ) {
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
          if (isInBounds(tx, ty, state.mapWidth, state.mapHeight)) {
            const tile = state.map[ty][tx]
            if (
              tile.type !== TileType.Sand &&
              tile.type !== TileType.Space &&
              tile.type !== TileType.CaveEntrance
            ) {
              state.map[ty][tx] = { type: TileType.Clover }
            }
          }
        }
      }

      const beeEntity = state.world.createEntity()
      state.world.addComponent(beeEntity, ComponentType.Position, { x: state.player.x, y: state.player.y })
      state.world.addComponent(beeEntity, ComponentType.EntityTag, 'bee')
      return true
    },
  },
  {
    ingredients: ['meteorite', 'permacomputer'],
    kind: RecipeKind.Craft,
    resultName: 'omnibox',
    resultIcon: '\u25A1',
    preserveIngredient: 'permacomputer',
    description: 'folded space within a portable container.',
    execute: state => {
      const fit = findFitPosition(state.backpack, 'omnibox')
      if (!fit) return false
      const uid = crypto.randomUUID()
      createOmniboxContainer(state, uid)
      placeItem(state.backpack, 'omnibox', fit.rotation, fit.gridX, fit.gridY)
      // Link the newly placed item to the omnibox container by updating its uid
      const placed = state.backpack.items[state.backpack.items.length - 1]
      if (placed) {
        // Replace the auto-generated uid with our pre-generated one
        const container = state.omniboxContainers.get(uid)
        if (container) {
          state.omniboxContainers.delete(uid)
          state.omniboxContainers.set(placed.uid, container)
          container.id = placed.uid
        }
      }
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
