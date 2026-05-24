# Backlog thinktank — v11

A continuation of v10. v10 ran 2 rounds, locking the holographic day/night phase (four days and four nights per year, derived from `seasonalPhase`) and the price-it-don't-monetize-it doctrine for the artifact (one-time purchase, DRM-free, demo bounded to the first tenure). v11 opens with a question Tyler brought to the room on 2026-05-24: _do we need a concept of an equipped item now that meteorite hallowed ground (`RP-18`) and the field camera (`RP-23`) are in flight?_ The seed observation: the existing "[x] to drop" + drag-and-drop pipeline is vestigial from when the game was crafting-heavy, and the verb is wrong — you don't _drop_ a field camera, you _set it up_; you don't _drop_ a meteorite to make a sacred space, you _place_ it. The room found that v4 R7's _the inventory is the character sheet_ has been waiting for exactly this mechanic — the seam where carrying becomes meaning.

What follows is the rounds. Decisions are stated as decisions. Open questions are flagged. v11 is _additive_ to v10 — it does not invalidate v10 unless a round here explicitly amends it. Items that should propagate back to earlier versions are tagged `**Amendment to v{N}:**`.

## The cast

Carried forward from v2/v3/v4/v5/v6/v7/v9/v10 with no changes:

- **Astrid** — vision purist.
- **Boon** — systems-first.
- **Calla** — player-experience pragmatist.
- **Delta** — late-arriving frame-breaker.

## Open and locked

**Locked in round 1:**

- **Two verbs, not one.** `[x] to drop` is preserved untouched as a general inventory affordance for every item type. _Place_ is added as a second, distinct verb for placeable items. The steward chooses which gesture they mean.
- **New field on `GameState`: `equippedItemUid: ItemUid | null`.** Single-owner write through the inventory layer, registered in `EXPECTED_FIELDS`, uid-keyed for stack/sort/merge resilience like `state.glintingCoins` and `state.seedGenomes`.
- **Left-click (currently unused outside cursor positioning) becomes the place action when something is in hand.** Nothing-in-hand left-click behavior is preserved.
- **Drag stays for in-grid rearrangement.** Drag-from-grid-to-world is retired as the _placement_ path for placeable items; drop via `[x]` remains for those items.
- **Each placeable item registers a `PlaceableSpec`** — `{ verb, canPlace, place }`. Hover hints and in-game prose read the item's verb (_set_, _set up_, _lay_, _place_, _sow_), not a uniform substrate.
- **In-hand is sticky.** Each place consumes one; the stack decrements; in-hand auto-clears when empty. An explicit unequip path is required (right-click or a small keybinding, deferred to spec).
- **Loaded cursor.** The cursor's hot-pink highlight tile is unchanged in form. When something is in hand and the hovered tile passes `canPlace`, the cursor's inner glyph reads as the in-hand item. When `canPlace` is false, the loaded glyph drops out; the cursor returns to its plain highlight. Hot-pink-as-user-action stays locked.
- **Permacomputer HUD affordance.** A slot on the bottom-bar instrument cluster (`RP-28`) shows the in-hand item's glyph and name in hot pink. The bag holds; the hand declares.
- **The noun in player-facing copy is _in hand_, not _equipped_.** Code can keep `equippedItemUid` for engineering clarity; manual entries, hover hints, and prose read "in hand," "take in hand," "set down."
- **Amendment to v4 R7:** _the inventory is the character sheet_ now has its mechanic. The in-hand-and-place layer is the seam where that doctrine becomes a verb instead of a metaphor.

**Open in v11:**

- _(none yet — open questions are tracked on individual specs, not as v11 doctrine)_

---

## Round 1: to drop, and to place

_Tyler: "i think we might need a concept of 'equipped item' now. im working on meteorite hallowed ground and field camera. '[x] to drop' and drag and drop feels very unsatisfying. that mechanic/language is vestigial from when this was more of a crafting game with lots of inventory management. and truthfully you don't 'drop' a field camera. you set it up. and you don't 'drop' a meteorite to make a sacred space. you place it. gaming it out a bit, i think if you had a bunch of meteorites in your inventory you could equip any one of them and then probably left click (currently unused) would place them one at a time. you would need to equip each one individually."_

> **Astrid:** The verb is the relationship. To _drop_ a stone is to disown it — to let go of something you no longer want. To _place_ a stone is to dedicate it — to declare a position the stone is now to hold. The prairie's whole substrate has wanted the second verb for a long time; the crafting-game language is vestigial in exactly the way Tyler says, presuming the inventory was a buffer and the world was the destination for surplus. The prairie's inventory is not a buffer; it is what the steward is carrying, and the carrying matters. _Dropping_ is allowed — the steward should be free to disown a thing, the bag should not be a cage — but it must not be the _only_ verb. v4 R7 named the inventory the character sheet; this round is when that line earns a second verb. Each placeable item declares the sentence the steward is finishing — the meteorite is _set_ or _laid_; the camera is _set up_; a seed, when this lands on it, is _sown_. The drop is still there for the steward who just wants to put a thing down. The place is there for the steward who wants to _mean_ something by putting it down. _One verb is a warehouse. Two verbs is a relationship._

> **Boon:** Substrate. New field on `GameState`: `equippedItemUid: ItemUid | null`. Single-owner write through the inventory layer, registered in `EXPECTED_FIELDS`. uid-keyed for the same reason `state.glintingCoins` and `state.seedGenomes` are — survives `autoSort`, merge, stack, and split without losing the reference. Left-click, currently routed only to cursor positioning, becomes the place action when something is in hand; otherwise left-click stays cursor-only. The `[x] to drop` keymap is preserved untouched — drop remains a general inventory affordance for every item type, placeables included. What goes away is drag-from-grid-to-world _as the placement path for placeables_; drag stays for in-grid rearrangement, and drop-via-`[x]` stays for everything. Per-item placement is delegated to a `PlaceableSpec` registered alongside the item def: `{ verb: 'set' | 'set up' | 'sow' | 'lay' | 'place'; canPlace(state, x, y): boolean; place(state, x, y, uid): void }`. Meteorite spec appends to `state.placedMeteorites` and decrements the equipped stack; camera spec instantiates a `PlacedCamera` and consumes the slot entirely. HUD affordance: a slot on the permacomputer bottom-bar instrument cluster (`RP-28`) shows the in-hand item's glyph in hot pink with its name. The cursor's hot-pink highlight tile is unchanged in form; when something is in hand and the hovered tile passes `canPlace`, the cursor's inverted-dark foreground glyph swaps to the in-hand item's glyph — a "loaded" cursor reading as the steward's hand pre-empting the tile. When `canPlace` is false, the loaded glyph is suppressed (the cursor reads as its usual highlight, no payload), so legality is readable at a glance. Stack semantics: in-hand is sticky, each place consumes one, the stack decrements, in-hand auto-clears when empty. Right-click (or a keybinding deferred to spec) unequips. Net cost: one field, one registry, one input branch, one bottom-bar slot, a label sweep. Small-to-medium.

> **Calla:** The drag was twitchy and the verb was wrong; this fixes both at once without making the steward give anything up. Drop stays — there are weeks when the inventory is messy and the steward just needs to put a thing down — and place arrives as a distinct gesture for the moments that matter. Two verbs is more truthful than one. The HUD affordance is what makes the second verb legible: a slot on the permacomputer bottom bar shows what is in hand right now, glyph and name, in the same hot pink the world preview uses. The steward glances down and sees what they are _carrying with intent_, separate from what is in the bag. _That_ is what the drag-and-drop tried to express and could not. The bag holds; the hand declares — and the cursor confirms. The cursor's form stays the hot-pink tile the steward already recognizes; the only change is that the tile's inner glyph becomes the in-hand item when the steward is hovering a legal placement. A small, quiet affordance — not a new cursor mode, just a hint that the next click will mean something. When the hovered tile is illegal, the loaded glyph drops out; the cursor returns to its plain highlight, and the steward learns the boundary without a message. Concerns the spec needs to honor: an explicit unequip path so a hair-trigger left-click on a long walk does not surprise the steward; `canPlace` honest about which tiles are legal; per-item hover-hint copy that reads from the verb — _set down_, _set up_, _sow_ — and not from a uniform substrate.

> **Delta:** The frame to break is the word "equip." It is the right mechanic and the wrong noun — it carries an RPG inheritance the prairie is otherwise free of (no class, no level, no slot tree). The prairie's word is _in hand_. The steward has the meteorite _in hand_; the steward _takes the camera in hand_; the manual reads "to set down what is in hand, click." Small change, just labels — but labels are what the steward sees, and the prairie's language is half the game. The deeper frame, and this is the line worth locking, is that this round is the moment the inventory stops being a container and becomes a relationship. The grid is not a backpack; the grid is everything the steward is currently carrying _and currently meaning_. The bottom-bar slot is the second sentence of the same paragraph — the bag holds; the hand declares. Drop did not need to die for place to be born; the two verbs need each other. One open thing the round should name and not solve: when this lands, `RP-11`'s drop-on-dirt-to-plant becomes _sow-from-in-hand_, and the seed-into-soil contact gets the same treatment. That is not for this spec; that is the second-order tax this idea pays the rest of the inventory. _Two verbs is what makes one of them a ceremony._

### Consensus

- New field on `GameState`: `equippedItemUid: ItemUid | null`. Single-owner write through the inventory layer, registered in `EXPECTED_FIELDS`, uid-keyed for stack/sort/merge resilience.
- Left-click (currently unused outside cursor positioning) becomes the place action when something is in hand. Nothing-in-hand left-click behavior is preserved.
- `[x] to drop` is preserved untouched. Drop remains a general inventory affordance for every item type, placeables included. Place is _additive_, not a replacement — the steward has two verbs available.
- Drag stays for in-grid rearrangement. Drag-from-grid-to-world is retired as the _placement_ path for placeable items; drop via `[x]` remains for those items.
- Each placeable item registers a `PlaceableSpec` — `{ verb, canPlace, place }`. Hover hints and in-game prose read the item's verb.
- In-hand is sticky: each place consumes one; the stack decrements; in-hand auto-clears when empty. An explicit unequip path is required (right-click or a small keybinding, deferred to spec).
- The cursor's hot-pink highlight tile is unchanged in form. When something is in hand and the hovered tile passes `canPlace`, the cursor's inner glyph reads as the in-hand item — a "loaded" cursor. When `canPlace` is false, the loaded glyph drops out; the cursor returns to its plain highlight. Hot-pink-as-user-action stays locked.
- Permacomputer HUD affordance: a slot on the bottom-bar instrument cluster (`RP-28`) shows the in-hand item's glyph and name in hot pink. The bag holds; the hand declares.
- The noun in player-facing copy is _in hand_, not _equipped_. Code can keep `equippedItemUid` for engineering clarity; manual entries, hover hints, and prose read "in hand," "take in hand," "set down."
- **Amendment to v4 R7:** _the inventory is the character sheet_ now has its mechanic. The in-hand-and-place layer is the seam where that doctrine becomes a verb instead of a metaphor.

### Tracked as

- **`RP-59 In-hand + place (additive placement verb, HUD affordance)`** — M, depends on `['RP-18', 'RP-23', 'RP-28']`. New `equippedItemUid` field, `PlaceableSpec` registry, left-click placement routing, loaded-cursor glyph swap, unequip path, permacomputer bottom-bar in-hand slot. `[x] to drop` left intact for all items.
- **Amendment to `RP-18`:** meteorites are placed via in-hand + left-click. They can still be dropped via `[x]` (as a regular `ItemDrop`); place vs. drop are now two distinct verbs for the same item, with different semantics (drop → ground item; place → `state.placedMeteorites` and hallowed-ground geometry).
- **Amendment to `RP-23`:** the field camera is _set up_ from in-hand. The camera's `place` consumes the inventory slot entirely (unique artifact). Drop via `[x]` remains available.

### Open questions deferred to specs

- Does `RP-11` (seeds, drop-on-dirt-to-plant) migrate to in-hand-and-sow on the same pass, or follow-up? (Delta, Boon) Room's lean: follow-up; ship `RP-59` for meteorites and camera first.
- The exact unequip input — right-click vs. `[e]` vs. clicking the in-hand slot. (Calla, Boon) Defer to spec.
- The exact location of the HUD affordance within the bottom-bar instrument cluster (`RP-28`) — left of the ambient instruments? Right? Center? (Calla)
- The exact treatment of a "loaded" cursor over an illegal tile — drop the glyph entirely (lean), or render it muted? (Boon, Calla) Defer to spec.
- Whether non-placeable items can also be _in hand_ as a future hook (e.g. for `RP-15` wear-on-use). (Boon) Lean: placeable-only for now.
- Per-item hover-hint copy from `PlaceableSpec.verb` — editorial pass before lock. (Astrid)
