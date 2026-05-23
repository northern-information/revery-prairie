# Precis thinktank — v7

A continuation of v6. v6 ran rounds 1–6, locked the steward → Revery → Emily → coyote → Knot → cellar axis. v7 picks up after v6 with a new arc, sparked by a sentence Tyler brought to the room on 2026-05-22: _crossbreeding doesn't work — it's GMO, it's capitalist. We can observe and trace lineages but we can't crossbreed._ The room found that `#12` (Crossbreeding UX) was the surface of a deeper cosmological mismatch — the verb the player applies to genetics.

What follows is the rounds. Decisions are stated as decisions. Open questions are flagged. v7 is _additive_ to v6 — it does not invalidate v6 unless a round here explicitly amends it. Items that should propagate back to earlier versions are tagged `**Amendment to v{N}:**`.

## The cast

Carried forward from v2/v3/v4/v5/v6 with no changes:

- **Astrid** — vision purist.
- **Boon** — systems-first.
- **Calla** — player-experience pragmatist.
- **Delta** — late-arriving frame-breaker.

## Open and locked

**Locked in v7:**

- **Player-directed crossbreeding is cosmologically forbidden.** `#12` (Crossbreeding UX) is removed from the backlog. Optimization-as-verb is out; the cosmology is _conditions → what survives_, not _input → desired output_.
- **Lineage is a record, not a result.** The prairie remembers; the prairie does not engineer. The genetics substrate (`#3`) and the naturalist's manual (`#6`) are observation infrastructure, not breeding infrastructure.
- **The steward is a naturalist, not a breeder.** The verbs of stewardship are notice, name, and hang the Knot. _Not_ select, optimize, or breed.
- **Autonomous bee-mediated pollination stays.** `#17`'s shipped behavior is the prairie's own process — pollen moves via bees; identities mix where bees route. The player does not direct it, and that is the difference between pollination and breeding.
- **Engine and surface vocabulary must read as naturalism, not engineering.** Audit existing "father / mother / cross" naming in pollination code; the behavior is fine, but the names carry the wrong cosmology. Rides as a maintenance task on `#17`, not a separate precis.

**Open in v7:**

- _(none yet — open questions are tracked on individual specs, not as v7 doctrine)_

---

## Round 1: lineage is a record, not a result

_Tyler: "crossbreeding doesn't work. it's gmo. it's capitalist. we can't do it. we have it in the backlog right now. we can observe and trace lineages but we can't crossbreed."_

> **Astrid:** The room has been carrying `#12` since the early sequencing and it never quite fit, and now we have the reason. The cosmology's verb is _tending_, not _steering_. Crossbreeding's whole grammar is steering — the steward picks two parents and forecloses on what the offspring will be. That is a breeder's hand, not a naturalist's. Dickinson did not write _to make a prairie it takes a clover and a bee, and a selection program_. She wrote _revery_. The five-line lock holds: heat death is the antagonist, tending is the verb, the tenure is the unit, the lineage is the medium, the inventory is the character sheet. _Lineage is the medium_ — meaning it carries the prairie's record forward — _not_ the medium the steward sculpts. Even the engine's existing names betray the cosmology: `father`, `mother`, `crossTraitBags`. Those words inherited a discipline that does not belong to this prairie.

> **Boon:** `#12` is unsequenced — no spec, no plan, no PR — so removal is a one-line YAML change. The genetics substrate (`#3`, shipped) and the naturalist's manual (`#6`, shipped) stand on their own; nothing depends on `#12`. `#17` (shipped) is the load-bearing question. Bee-mediated cross-pollination is wired in `src/engine/beePollination.ts` and `src/engine/flora/actions/pollinate.ts` — `PollenBag` on bees, `crossTraitBags` fires on next spread, father = pollen, mother = visited tile. The behavior is naturalistic — bees do this; the player does not direct it. So the code stays. What needs an audit is the vocabulary. `father` / `mother` / `cross` reads as a breeder's lab notebook even when the runtime semantics are a meadow's. Same for any player-visible surface — the lineage overlay (`[2]`), the hex grid, the manual's `event:cross-pollinated` entry. The audit is a renaming pass and a lore brief, not a re-architecture. Cheap.

> **Calla:** What this changes is the shape of mastery. Today a player could imagine — and the backlog promised — a future where they breed bees for prolific pollination or clover for cold-resistance. Tyler is closing that future, and what remains is observation. The player walks the prairie, notices an unusual identity, scans it with the permacomputer, files the hex grid in the manual, and over many autumns the lineage hangs in the cellar as Knot-text. The mastery is _noticing what the prairie produced_, not _producing what the player wanted_. That is the same loop the camera (`#23`) and predecessor stewards (`#24`) already point at; this round just refuses the competing loop that was sitting in `#12`. The next session does not get smaller — it gets cleaner. The naturalist's field journal is the texture; the greenhouse is gone.

> **Delta:** Permanence is a capitalist assumption — and so is the breeding program. The whole point of GMO as a frame is that an actor stands outside the field and shapes what comes out of it; the cosmology refuses that posture for the egregore, for the angel, for the ghost, and now finally for the genetics. The line to take forward is the one this round was always going to land on: _lineage is a record, not a result_. The prairie remembers; the prairie does not engineer. The steward is the witness, the namer, and the one who hangs the Knot — not the selector. Everything `#17` already does is the right shape; the surfaces just need to stop sounding like a lab. The verbs of stewardship are notice, name, hang. _Not_ select.

### Consensus

- `#12` Crossbreeding UX is removed from the backlog. Player-directed breeding is cosmologically out of scope.
- Autonomous bee-mediated cross-pollination from `#17` stays in code and in behavior. The prairie pollinates itself; the player does not direct it. That distinction is load-bearing.
- The genetics substrate (`#3`) and the naturalist's manual (`#6`) stay as observation infrastructure. Lineage is recordkeeping, not optimization.
- Engine and surface vocabulary needs an audit pass: `father` / `mother` / `crossTraitBags` in `beePollination.ts` and `flora/actions/pollinate.ts`, the lineage overlay (`[2]`) text, the hex grid label, and the `event:cross-pollinated` manual entry's lore brief. Audit rides on `#17`'s notes as a maintenance task, not a separate precis.
- The steward is a naturalist, not a breeder. The verbs of stewardship are notice, name, hang the Knot.

### Tracked as

- **Amendment to `#12`:** removed from backlog entirely. The id slot vacates. Player-directed crossbreeding UX is cosmologically forbidden; no replacement item is needed — observation already has its surfaces in `#3`, `#6`, `#17`, and the cellar (`#37`).
- **Amendment to `#17`:** autonomous bee-mediated pollination stays in code and behavior. A vocabulary audit (rename `father` / `mother` / `crossTraitBags` in `beePollination.ts` and `flora/actions/pollinate.ts`; check the lineage overlay `[2]` text, the hex grid label, and the `event:cross-pollinated` lore brief for breeder register) is appended to `#17`'s notes as a maintenance task. Not a separate precis.

### Open questions deferred to specs

- (Boon) which substitute register for the renaming pass — _pollination_, _inheritance_, _passage_. Lean: `pollenSource` / `pistilTile` (or `receivingTile`) / `pollinateIdentities`, but the maintenance pass confirms.
- (Calla) whether the lineage overlay's existing rendering implies engineering in any way a player would read as a breeding tool. If not, no surface change beyond labels.
- (Astrid) whether the `event:cross-pollinated` lore brief needs an explicit language constraint flagged for the human author — naturalism register, not breeding-program register.
