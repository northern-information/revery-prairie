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

**Locked in round 2:**

- **The prairie speaks one visual language.** ASCII-on-canvas for the world, sparse UI affordances (dialog box, permacomputer, inventory grid) in their existing register, hot-pink reserved for steward-actions. No character has an animated portrait. Characters land through voice — dialog, music cue, glyph color.
- **Gron's `/gron.gif` is retired.** The asset is inheritance from a previous project, not a design choice. The `portrait?` field on `CharacterEntry` / `CharacterDefinition` is removed; `DialogBox` no longer renders portraits.
- **Emily is the threshold figure**, not Gron. Her authority is her stillness and her words ("you will return before the winter solstice, to revery"). The cosmology does not need a face for the first character.
- **`Gate` is flagged as not-a-character.** The locked-gate interactable wearing a `CharacterEntry` is the system telling us the `Character` type is overloaded. Deferred to its own round/spec — does not block the portrait retirement.

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

---

## Round 2: the gif from the previous apartment

_Tyler: "what do you think about adding character animations for npcs? right now we only have gron. i like it. it is evocative. but it is the only non-ascii or canvas asset. i'm not particularly excited to make them, oddly. i'm wondering if they help or hurt the game from a cosmological sense. i think it gives characters more weight, but it feels sorta odd to then have nothing similar for the prairie which is the real main character. (after a beat: gron is not the first character — emily is. and i really don't know if we should keep gron. it's kinda all or nothing to me. he was a previous asset i had made years ago and just slotted in.)"_

> **Astrid:** Then the cosmology has already answered. Emily is the threshold — the girl who waits inside the little house, the voice that delivers the canonical refrain, _you will return before the winter solstice, to revery_. Emily has no portrait. She does not need one. Her authority is in her words and her stillness; the steward meets her in ASCII and the line lands harder for it. If Emily can carry that weight without a face, every other character in the cast can. Gron's gif is not the threshold's portrait, because the threshold is already accounted for. It is, as Tyler said plainly, an asset from a previous game that got slotted in. _Listen to what the hand will not make._ Tyler's lack of excitement to make more is not creative block — it is the cosmology speaking through the hand, and the hand is saying the prairie does not want faces. The prairie is the main character; the steward is the only body that gets to move; the named ones speak and leave. _A face would round the steward's interlocutors into people. The cosmology asks them to remain visitors._ Remove the gif. The prairie does not have a portrait, and neither should anyone in it.

> **Boon:** Field audit. `src/engine/characters.ts:11` declares `portrait?: string`. Two characters set it: `gron` at line 24 and `coyote` at line 54 (both pointing at `/gron.gif` — Coyote's is a copy-paste). Every other character — Moab, Gate, Emily, the ghost cohort — leaves it unset. The optional field is one-use, and the one use is the asset Tyler is questioning. Cleanup path is small: delete `/gron.gif` from `public/`, remove the `portrait` field from `CharacterEntry` and `CharacterDefinition`, drop the `portrait?` prop from `DialogBox` and its test fixtures (`src/components/__tests__/DialogBox.test.tsx:80-82`), and let the dialog box render uniformly across the cast. Net: one asset retired, one optional field retired, one prop and its alt-text test retired. Small. While the hand is in there: `gate` at line 57-62 is not a character. Glyph `#`, one line, no music, no gift — it is a locked-gate interactable wearing a `CharacterEntry`'s clothes because the dialog pipe was the easiest route. That is a separate concern; flag it as a follow-up, do not bundle. The portrait removal does not depend on resolving it. _The cheapest spec is the one that retires a field instead of populating it._

> **Calla:** The word Tyler used was "evocative" — and that is real. Gron's gif _is_ evocative. The question is what is doing the evoking: the animation itself, or the novelty of a moving face in an otherwise still-and-rendered world? The answer is almost certainly the novelty. Extend it to four NPCs and the gif stops feeling like a window into someone and starts feeling like a portrait gallery — and a portrait gallery is exactly the kind of RPG inheritance the prairie has been avoiding. Strip it back to none and the dialog box becomes a different shape of intimacy: the steward and a voice, in the same visual register as the prairie itself. Emily's line, in particular, lands harder without a face attached to it; the absence is the weight. _One register for everyone, including the threshold._

> **Delta:** The frame to break is "should we add animations." Wrong question, and Tyler already broke it himself when he said _all or nothing_. The actual decision is whether to keep a piece of furniture from the apartment you moved out of. Gron's gif is doing two things at once — it looks like an art-direction choice, and it is actually inheritance from a previous project. Inheritance and intention are different things. The prairie has built a coherent visual language: ASCII-on-canvas for the world, sparse UI affordances for the bag and the dialog and the permacomputer, hot-pink reserved for steward-actions. The gif is the one piece that does not speak that language. _The camera does not know it is the camera, and the prairie does not know it is the prairie_ — but the gif knows it came from somewhere else. Retire it. While you are at it: `Gate` is a clue. The fact that a locked door is implemented as a `Character` is the system telling you the `Character` type is overloaded — it currently means "anything you can press `[f]` on and get a line back from." That is a different round, but worth naming so it does not get lost. _One visual language, no inheritance, no faces._

### Consensus

- **Remove Gron's portrait.** Delete `/gron.gif` from `public/`, remove the `portrait?` field from `CharacterEntry` (`src/engine/characters.ts:11`), `CharacterDefinition` (`src/engine/types.ts`), and the `Character` runtime type. Drop the `portrait?` prop from `DialogBox` and update the test fixture (`src/components/__tests__/DialogBox.test.tsx:80-82`).
- **Coyote's `/gron.gif` reference dies with the field** — no separate fix needed.
- **The prairie speaks one visual language**: ASCII-on-canvas for the world, sparse UI affordances (dialog box, permacomputer, inventory grid) in their existing register, hot-pink reserved for steward-actions. No character has an animated portrait. Characters land through voice — their dialog, their music cue, their glyph color.
- **Emily is the threshold figure** by virtue of being the first character the steward meets and the carrier of the canonical refrain. Her authority is in her stillness and her words. No portrait needed; no portrait wanted.
- A one-line conventions note in `CLAUDE.md` confirming the no-portrait doctrine, so future contributors (and future-Tyler) do not read absence as a TODO.

### Tracked as

- **`RP-61 Retire Gron portrait and the portrait field`** — S, no deps. Delete `/gron.gif`. Remove `portrait?: string` from `CharacterEntry` in `src/engine/characters.ts:11`, from `CharacterDefinition` in `src/engine/types.ts`, and from the `DialogBox` props and its test (`src/components/__tests__/DialogBox.test.tsx`). Add a one-line conventions note in `CLAUDE.md` declaring that no character has an animated portrait — the prairie speaks one visual language.
- **`RP-62 Gate is not a character`** — XS, no deps, deferred. The locked-gate interactable at `src/engine/characters.ts:57-62` is routed through the `Character` system because `[f]`-to-talk was the easiest path. Spec out whether `Character` should be split into `Character` (named persons with dialog) and `Interactable` (things that respond to `[f]` with a line), or whether Gate should move to a different system entirely. Not blocking on `RP-61`.

### Open questions deferred to specs

- _(none — round produced a lock, not new uncertainty.)_
