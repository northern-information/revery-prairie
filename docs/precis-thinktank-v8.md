# Precis thinktank — v8

A continuation of v7. v7 ran rounds 1–3, locking lineage-as-record (not result), two-layer overworld fog, and the prairie's bones (verticality, thermogenic egregores, winter geology, lightning fire). v8 picks up after v7 with a question Tyler brought to the room on 2026-05-23: _what if there is a 'shadow steward' or 'umbral steward' who is an NPC and in service of egregoric flora?_ He brought it openly — as a "what if," not a conviction — and asked the room to weigh it against the cosmology. He noted alongside it the recently shipped collapse-spawn-egregore mechanic (precis `#32` / `#33`) and asked the room to read both together.

What follows is the rounds. Decisions are stated as decisions. Open questions are flagged. v8 is _additive_ to v7 — it does not invalidate v7 unless a round here explicitly amends it. Items that should propagate back to earlier versions are tagged `**Amendment to v{N}:**`.

## The cast

Carried forward from v2/v3/v4/v5/v6/v7 with no changes:

- **Astrid** — vision purist.
- **Boon** — systems-first.
- **Calla** — player-experience pragmatist.
- **Delta** — late-arriving frame-breaker.

## Open and locked

**Locked in v8:**

- **The shadow steward is not an NPC.** The prairie has conditions, not enemies; no faction stands "in service of" the egregore. An umbral-steward agent is cosmologically forbidden for the same reason the breeder was in v7 R1.
- **The umbral steward already exists — as the violet patch on the tile where a steward collapsed.** Body, not person. The cellar carries the name; the prairie carries the body.
- **Collapse-spawn (`#32` / `#33`) is cosmologically correct as shipped.** Loss is the prairie keeping what the steward did not return with.

**Open in v8:**

- _(none yet — open questions are tracked on individual specs, not as v8 doctrine)_

---

## Round 1: the umbral steward is not a peer of the egregore

_Tyler: "what if there is a 'shadow steward' or 'umbral steward' who is an npc and in service of egregoric flora? this is seriously a 'what if' — not a 'i think this is a good idea and i want you to agree with me.' weigh it against our cosmology. also note i — on intuition — added a feature where if the player fails to return to emily before revery they spawn egregoric flora where they collapse."_

> **Astrid:** Start with the second seed, because it answers the first. The collapse-spawn mechanic — the steward who does not make it back to the little house and is consumed where they stood — is already the cosmologically correct rendering of an umbral steward. _The prairie sleeps the steward where the steward stands_ was v6's line, and the violet patch the tile becomes the next winter is the cosmology being precise about what happens when a tenure ends in the field instead of in the bed. That is not service. That is consumption. To then add an NPC who is _in service of_ the egregore would reintroduce the breeder's posture from a different direction — Round 1 of v7 closed the door on the steward as breeder; a shadow-steward-as-agent would open the same door for the egregore. _Service implies a contract. The prairie has no contracts._ The egregore does not have allies; it has territory. The cosmology does not have factions; it has weather. So no — no umbral-steward NPC. But yes, an umbral steward — the one who already exists, the one whose tile holds a violet patch because they did not make it back. That is the one the cellar should be ready to remember.

> **Boon:** The mechanic Tyler is describing exists in code. `state.collapsedStewardTile` is set at `src/engine/revery.ts:122` when the summons fires on the overworld; `commitEgregoreTiles` runs at `src/engine/revery.ts:311-325` during Closing and writes the egregore to the captured tile on the overworld map. That is the body. What is _not_ yet wired is the recordkeeping. `#24` (Predecessor stewards) and `#37` (Cellar) are the natural attribution layer — the Knot that hangs in the cellar should know which steward's tenure ended in the field and on which tile, so a future tenure walking the prairie can look at a violet patch and know "Steward Mara, autumn of her third year, did not return." That is not new infrastructure; it is two pointers — a steward-id on the egregore tile, and a cellar-lineage entry referencing the tile. Cheap. An _NPC_ in the breeder sense is the other end of the cost spectrum: dialog tree, schedule, pathing, dormancy behavior, faction logic for "in service of," and a tone problem that no amount of writing solves. The room should reject the NPC framing on cost alone even before Astrid's cosmology axis hits.

> **Calla:** Two things to separate cleanly. The first is the shipped collapse-spawn mechanic, and Tyler's intuition is right — that one lands. It turns "you didn't make it to Emily this year" from a soft failure into a permanent mark on the prairie. The tile becomes a place the next steward will walk past and have to reckon with, and over many tenures the prairie accumulates a quiet map of where stewards fell short of the door. That is the same shape as the Knot — _the cellar remembers what the prairie lets go_ — and it is the right kind of loss for this cosmology. The second is the shadow-steward NPC, and I want to test it against the next-session question, because that is the test it fails. An NPC in service of the egregore would be the first opponent in the prairie. The steward currently has heat death, weather, the slow geology, the sudden fire — none of which have a face. Adding a face changes the session from _walking a place_ to _avoiding a person_. Every system v6 and v7 locked points the other way: the prairie has no enemies; the prairie has _conditions_. So I would not put a person between the steward and the violet patch. The violet patch is enough. _The umbral steward is a place, not a person._

> **Delta:** The shadow steward already exists; it is just spelled "egregore on the tile where the steward fell." Tyler has been building this for two precis cycles without naming it — `#32` captures the collapse tile, `#33` commits the egregore, `#24` is the predecessor lineage, `#37` is the cellar that records it, the camera (`#23`) was always pointed at the absent. We have been building toward a single feature, and the feature is: _the prairie keeps a record of stewards who did not return, and the record is a body, not a name._ Add the attribution pointer Boon described and that feature ships. Do not add an NPC. The NPC would be a faction — the prairie does not have factions, and the moment we draw one, the cosmology cracks. Astrid said it: _service is a contract; the prairie has no contracts._ Take the line and the room is done. The other line worth keeping is the one this round arrives at on the merge: _the umbral steward is not a peer of the egregore. The umbral steward is the egregore._ That is the reframe — the tile is the trace; the trace is the steward; the steward fed the prairie one last time and the prairie's fever held that gift through the winter.

### Consensus

- Reject the shadow-steward-as-NPC framing. An NPC "in service of" the egregore would introduce a faction and an opponent, both of which the v6/v7 cosmology locks foreclose. The prairie has conditions, not enemies.
- The collapse-spawn mechanic (`#32`'s Closing-phase commit on `collapsedStewardTile`) is cosmologically correct as shipped. It is not loss-as-punishment; it is the prairie keeping what the steward did not return with.
- The umbral steward already exists in code: the egregore at the collapse tile. What is missing is the _record_ — attribution to a tenure, traceable through `#24` (Predecessor stewards) and `#37` (Cellar), so a future steward can stand on a violet patch and know whose tenure ended there.
- The cellar / Knot is the right home for the attribution. The egregoric tile itself does not get a new glyph or a new EVA token; the record lives in the cellar lineage, not in surface flora vocabulary.
- The collapse-tile egregore inherits the v7 R3 lock that egregoric flora is thermogenic — the violet patch where a steward fell will radiate heat in winter. The cosmology lands on its own: the steward gave the prairie one warm place against the heat death.

### Tracked as

- **Amendment to `#32`:** the open question "whether the field collapse leaves a persistent mark for predecessor cameras (`#23`, `#24`)" resolves _yes_ — via attribution recorded in the cellar lineage (`#37`) rather than the camera substrate. The camera still records the moment if one was watching; the cellar records the lineage regardless.
- **Amendment to `#24`:** Predecessor stewards' lineage records gain a "fate" distinction — whether the tenure ended in the bed (returned to the little house) or in the field (collapsed on the overworld). The latter case carries the collapse tile coordinate.
- **Amendment to `#37`:** the cellar Knot is the home for collapse-tile attribution. When a tenure ends with `collapsedStewardTile` set, the cellar gains a lineage entry pointing at that tile and the steward who fell there. Surfaces via the existing cellar Knot rendering, and via the permacomputer when scanning the violet patch.

### Open questions deferred to specs

- (Boon) data shape of the steward-id pointer — a field on the egregore-tile record, or a sibling map `state.collapsedStewardEgregores: Map<tileKey, stewardId>`. Lean the sibling map (keeps existing egregore shapes stable; only collapse-origin tiles need the link).
- (Calla) whether the permacomputer surfaces the attribution at any range, or only when the steward is adjacent to the violet patch. Lean adjacent — the prairie reveals its grief at the pace of walking.
- (Astrid) the cellar Knot's lore phrasing for a collapse-tile lineage. Naturalist register, not lab register; mortal register, not mythic register. Flagged for human authorship — the room does not write that line.
