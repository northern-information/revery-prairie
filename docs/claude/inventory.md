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

any code that re-creates `ItemInstance` objects (autoSort, merge, stack, split) must preserve the original `uid`. `state.glintingCoins` and `state.seedGenomes` are keyed by item uid — generating a new uid orphans the side-table entry.

## seeds and planting (RP-11)

`wildflowerSeeds` and `tallGrassSeeds` are genetics-bearing — each item carries a `FloraGenome` (identity + `TraitBag`) via the `state.seedGenomes: Map<itemUid, FloraGenome>` side-table. `ItemInstance` stays flat; the genome lives outside the inventory layer alongside the coin-glint pattern.

vault-spawn (DormantGarden ruins) derives the genome deterministically from `(stewardName, ruinIndex, vaultSlot)` via `generateGenesisIdentity` + `generateTraitBag`. pickup transfers the genome from the `ItemDrop` component to `state.seedGenomes` keyed by the new item uid.

dropping a seed onto an adjacent `TileType.Dirt` plants a stage-`Healthy` flora plant with the seed's genome supplied to `createFloraLifecycleEntry`; the seed is removed from the pack and `state.seedGenomes` deletes the entry. seeds cannot be set down as ground items — `dropItem` returns `false` if no adjacent Dirt tile exists.
