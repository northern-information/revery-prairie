# inventory and recipes

referenced from `CLAUDE.md`. read when touching items, container layout, drag-and-drop, or recipes.

## inventory

tetris-style spatial inventory. items have shapes (`boolean[][]`) that must physically fit in a container grid.

key types: `ItemDefinition` (template), `ItemInstance` (placed in container), `Container` (grid), `Rotation` (0/1/2/3).

categories: `Fauna`, `Flora`, `Tool`, `CelestialDebris`, `Gizmo`, `Seed`, `Artifact`, `Zoogenic` — expand as needed, don't add speculatively.

## recipes

recipes combine two items via drag-and-drop. defined in `src/engine/recipes.ts`.

- `kind`: `macro` (map effects, shows `!` on grid) or `craft` (creates items, shows result icon)
- `preserveIngredient`: optional definitionId of an ingredient that should NOT be consumed.
- `discoveredRecipes: Set<string>` on GameState tracks which recipes the player has used. undiscovered recipes show `?` on grid cells.

## item uid invariant

any code that re-creates `ItemInstance` objects (autoSort, merge, stack, split) must preserve the original `uid`. `state.glintingCoins` is keyed by item uid — generating a new uid orphans the glint state.
