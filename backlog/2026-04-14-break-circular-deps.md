---
type: change-request
author: claude
date: 2026-04-14
---

# break 2 circular dependency cycles in engine

the architecture audit found 2 runtime circular dependency cycles:

1. `movement.ts` -> `cave.ts` -> `coyote.ts` -> `movement.ts`. fix by extracting `getBlockedPositions` into `blocking.ts` — it's a pure query function that reads entity positions and has no dependency on cave or coyote logic.

2. `actionBar.ts` -> `deepTime.ts` -> `entities.ts` -> `movement.ts` -> `interaction.ts` -> `actionBar.ts`. fix by extracting `autoAssignRevery` from `actionBar.ts` into a utility module (e.g. `reveryAssignment.ts`) that depends only on types and reveries.

both work today due to ESM live bindings but are fragile — any future initialization-order dependency will produce silent `undefined` at import time.
