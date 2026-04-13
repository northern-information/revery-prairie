---
name: maintain-manual
description: Audit prairie manual for gaps and preview all entries
user_invocable: true
---

# /maintain-manual

Audit skill for keeping the prairie manual in sync with game content. Run after adding items, recipes, or characters to check for missing lore and preview all entries.

**All file writes must happen in a worktree.** Before scaffolding lore stubs or making any code changes, enter a worktree. Use the Agent tool with `isolation: "worktree"` for all steps that modify files. Never write changes directly on main.

**Always rebase before pushing or opening a PR.** Run `git fetch origin main && git rebase origin/main` in the worktree before pushing. Squash-merged PRs from other worktrees can silently diverge from your branch — rebasing ensures your changes apply cleanly on top of the latest main and prevents regressions from stale bases.

## Flow

### 1. Scan registries

Read the current state of all content registries:

- `src/engine/items.ts` — `ITEM_DEFINITIONS`
- `src/engine/recipes.ts` — `RECIPES`
- `src/engine/characters.ts` — `CHARACTER_DEFINITIONS`
- `src/engine/manual.ts` — `MANUAL_LORE`, `MANUAL_ONLY_ENTRIES`, `MANUAL_ENTRIES`

Build the full set of expected manual entry IDs by importing `MANUAL_ENTRIES` and listing all keys.

### 2. Audit gaps

Compare each entry's content against the `MANUAL_LORE` table:

- **Missing lore** — entry exists in `MANUAL_ENTRIES` but has no `MANUAL_LORE` entry (uses auto-derived summary as fallback). List these as "needs lore."
- **Missing hints** — entry has a `MANUAL_LORE` entry with lore but no `hints` array. Flag as optional suggestion, not an error.
- **Orphaned lore** — a key in `MANUAL_LORE` that doesn't match any entry ID in `MANUAL_ENTRIES`. Likely stale after a rename or removal.
- **Missing manual-only entries** — check if any new tile types, zones, or game events exist in code but have no corresponding skeleton in `MANUAL_ONLY_ENTRIES`.

### 3. Validate cross-refs

For every entry in `MANUAL_ENTRIES`, check that each string in `crossRefs` is a valid key in `MANUAL_ENTRIES`. Report any dangling references.

### 4. Preview all entries

Render a text table of every manual entry:

```
ID                  | Category  | Name           | Has Lore | Hints | Cross-Refs | Unlock Key
--------------------|-----------|----------------|----------|-------|------------|------------------
bee                 | fauna     | Bee            | no       | 0     | 3          | item:bee
clover              | flora     | Clover         | no       | 0     | 3          | item:clover
...
```

Sort by category (using `CATEGORY_ORDER`), then by registry order within each category.

### 5. Present report

Show the user:

- **Gap summary** — count of entries missing lore, missing hints, orphaned keys, missing manual-only entries
- **Dangling cross-refs** — list of entry IDs with invalid cross-ref targets
- **Full preview table** from step 4

If there are entries missing lore, offer to scaffold empty `MANUAL_LORE` stubs:

```typescript
const MANUAL_LORE: Partial<Record<string, { lore: string; hints?: ManualHint[] }>> = {
  bee: {
    lore: '',  // TODO: write lore
  },
  ...
}
```

Do not auto-write lore content. The skill identifies what's missing and scaffolds stubs — the user writes the actual prose.

### 6. Verify

Run `npm run test -- src/engine/__tests__/manual.test.ts` to confirm the cross-ref validation test passes after any changes.
