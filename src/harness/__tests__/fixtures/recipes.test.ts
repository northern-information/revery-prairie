import { RECIPES } from '@/engine/recipes'
import { ITEM_DEFINITIONS } from '@/engine/items'

const itemIds = new Set(Object.keys(ITEM_DEFINITIONS))

describe('fixture: recipe definitions', () => {
  it('has at least one recipe defined', () => {
    expect(RECIPES.length).toBeGreaterThan(0)
  })

  for (const recipe of RECIPES) {
    describe(`${recipe.ingredients[0]} + ${recipe.ingredients[1]} = ${recipe.resultName}`, () => {
      it('first ingredient references an existing item', () => {
        expect(itemIds.has(recipe.ingredients[0])).toBe(true)
      })

      it('second ingredient references an existing item', () => {
        expect(itemIds.has(recipe.ingredients[1])).toBe(true)
      })

      it('has a non-empty resultName', () => {
        expect(recipe.resultName.length).toBeGreaterThan(0)
      })

      it('has a valid kind', () => {
        expect(['macro', 'craft']).toContain(recipe.kind)
      })

      it('has a non-empty description', () => {
        expect(recipe.description.length).toBeGreaterThan(0)
      })

      if (recipe.preserveIngredient) {
        it('preserveIngredient is one of the recipe ingredients', () => {
          expect(recipe.ingredients).toContain(recipe.preserveIngredient)
        })
      }
    })
  }
})
