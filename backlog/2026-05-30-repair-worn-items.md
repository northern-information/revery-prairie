---
type: feature
author: Tyler
date: 2026-05-30
---

# Repair worn items (RP-15 follow-up)

RP-15 ships a body-wear surface on the camera (`maxUses = 12`; `state.itemWear[uid]` ticks `1/12` per archived season; clamped at 1.0). At `wear >= 1.0` the camera `PlaceableSpec` refuses placement and `ItemInfo.tsx` shows "Worn out — repair needed." Repair was intentionally deferred so the wear surface could ship clean. This entry turns that deferred verb into a real mechanic.

depends_on: `['RP-15']`.

## Open design question

Three candidate verbs were on the table during the /churn round on 2026-05-30 and none was picked:

- **(a) Recipe-based at a workbench or specific tile** — drag the worn item onto a designated tile / item (workbench, little house fireplace, anvil) and it resets to `wear = 0`. May consume ingredients. Fits the existing combine grammar.
- **(b) Repair kit in inventory** — a new craftable item (`repairKit`, `oilCloth`) combines with the worn tool to restore it. Self-contained; introduces a resource loop (repair kits must come from somewhere).
- **(c) Time / rest in the little house** — broken items restore themselves when the steward sleeps or after a game-time interval. No ingredients. Lowest friction; closest to "tending."

Tyler's cosmology lock — _tending is the verb; heat death is the antagonist_ — nudges toward (c) or a soft variant of (a). Needs its own thinktank round before scoping.

## Why this matters

The player-facing copy already promises repair exists ("Worn out — repair needed." in `ItemInfo.tsx`). The promise will start to grate the first time a steward wears out their tenure-start camera and finds nowhere to take it.

## Scope sketch

- Pick a repair verb (thinktank).
- Define what (if any) ingredients are consumed.
- Wire it into the existing inventory / recipe grammar so it composes with `combine.ts`.
- Reset `state.itemWear[uid]` to `0` on successful repair.
- Enumerate failure modes in the spec: repair attempted on a non-worn item; missing ingredients; outside the right tile or zone.
- Update the `ItemInfo.tsx` "Worn out — repair needed." status line to point at the repair surface once it exists (e.g. _"Worn out — repair at the little house."_).
