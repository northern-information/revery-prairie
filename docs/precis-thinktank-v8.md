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
- **The angel is a passage, not a character.** No pink highlight, no dialog, no canto on encounter. Aura-overlap is the recording event. (Round 2.)
- **The Knot is the angel's record surface.** Each unique encounter writes a deduped lineage entry to the cellar (`#37`). The Cantos screen, `state.angelCantos`, and the permacomputer's `'cantos'` nav are removed. The hex-grid surface remains only in flora sequencing (`#6` gel-band). (Round 2.)
- **The cast of angels is exhaustive.** Every cosmological actor the prairie has gets an angel — flora (clover, wildflower, tall grass, egregore), pollinators (bees), weather (rain, fire, lightning), cosmos (meteorites), geology (sundering). Each personifies a substrate that already exists or is locked in precis. (Round 2.)
- **The Angel of Egregores is included.** Same shape as the other angels; the body renders Voynich and the Knot entry is written in PUA glyphs awaiting human-authored lore. Same shelf, different hand. (Round 2.)

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

---

## Round 2: the angel is a passage

_Tyler: "let's rethink `#13`. it gets into breeding and GMO. drop the ability to interact with angels entirely — no pink highlight, no cantos, no nothing. if you walk into their aura it gets recorded to the knot. i'm still not sold on no egregoric angel. why exclude egregores? what about an Angel of Sundering, or Angel of Meteorites?"_

### The angel has no hand

> **Astrid:** _The angel is not a thing you talk to. The angel is a thing that passes through._ The pink highlight, the dialog, the canto-as-utterance — these were the angel pretending to be a character. `CLAUDE.md` makes pink the steward's color, reserved for user action, and the angel is not the steward's action. The angel is a condition with a face. Drop the highlight. Drop the dialog path. Drop the per-encounter canto append. _The likeness passes through and is gone._

> **Delta:** This is the round's first line and it does most of the work in this one: _the angel does not need a hand to be felt_. Once the hand is gone, every downstream worry the room has been carrying — the parity question, the canto-as-key question, the satanic-exclusion question — either dissolves or moves into the same shape. The angel becomes what it always wanted to be in the cosmology: a passage. Walk through it; it records; it leaves.

### The aura is the record

> **Boon:** The mechanism is small. Each frame, check whether the steward's tile sits inside any active angel's aura; if it does and that encounter has not yet been recorded, write a deduped lineage entry to the cellar Knot (`#37`). One bit per encounter, one append. Remove `state.angelCantos: string[]`, `src/components/CantosScreen.tsx`, the `'cantos'` entry in `src/hooks/useKeyboard.ts:28`, the conditional render at `src/components/GameScreen.tsx:144`, and the menu entry at `src/components/PermacomputerShell.tsx:12`. The hex-grid surface that used to live in the Cantos screen survives only where the v2 lock put it — flora sequencing, `#6` gel-band. _The grid was the wrong artifact for the right idea; the Knot is the right one._

> **Calla:** Aura-overlap is the cleanest possible engagement gate — the steward chose to walk through, that is enough — but it has one requirement the spec must honor or the whole rewrite goes invisible. The moment of overlap needs a sensory cue. Tyler has named the form: an `angel.mp3` plays on aura entry — a single audio register, no dialog, no screen interruption. _The angel is felt or it is not there._ The audio cue plus the existing 9x9 body and gold aura render are enough; without the sound the steward walks through and never knows, with it the encounter is a moment they remember in the body even if the Knot entry is what they go back to read. Same posture as `#23`'s camera: _the world communicates by being looked at_, and the angel is the world reaching back. The next-session shape stays warm — quieter than the old dialog-and-canto loop, but more honest.

### The cast is exhaustive

> **Delta:** _The prairie has many cycles, and all of them get faces._ That is the invariant. Once the angel is a passage and not a character, the cast can extend to every cosmological actor the prairie has and none of the additions cost anything new. Flora — clover, wildflower, tall grass, egregore. Pollinators — bees. Weather — rain, fire, lightning. Cosmos — meteorites. Geology — sundering. Each personifies a cycle that is already running. None of them are inventions; they are faces for actors the prairie already has.

> **Astrid:** And the actors are already in the precis. Fire and lightning sit on `#42` (v7 R3 — _lightning is the brief one_). Sundering personifies `#44` winter geology — the once-per-year reshaping that v7 R4 locked, the slow violence the steward cannot direct. Meteorites are already in `state.meteorites` and the contemplative `#cosmologicalDrift` register. The egregoric flora has `#8a` and `#8b`. The personifications cost nothing the substrate has not already paid for. _The angel is the cycle's likeness, not the cycle itself._

> **Boon:** Engineering: `ANGEL_AURA_KINDS` extends from three to ten. Each new kind is a handler in the same shape as the existing bees-spawn and clover-spawn loops at `src/engine/angels.ts:228-310`, wired into the substrate it personifies. Angel of Sundering's aura on overlap raises the next winter's ruin-shift probability in that region — defer rule to spec, depends on `#44`. Angel of Meteorites' aura calls a strike inside its drift — depends on the existing meteorite entity system. Angel of Egregores' aura primes egregoric spread under `#8b`'s existing throttle, no new metabolism. Angels of Wildflower and Tall Grass mirror Angel of Clover with the appropriate flora type. Per-frame cost stays bounded — one proximity sweep per active angel of the kind, same budget as the existing three.

### The egregore is not excluded

> **Astrid:** The cosmological worry I held two riffs ago was that an Angel of Egregores in the Clover-shape would fold the not-prairie into the prairie's grace economy. With interactivity gone, the grace economy is gone. There is no canto to be given, no dialog to be held, no gift to be bestowed. The angel is a passage that records. The egregore can have one, same shape, same shelf — and the cosmology stays intact because the shelf is _record_, not _grace_. _Same shelf, different hand._ The body renders Voynich; the aura's effect is metabolic, not generous; the Knot entry is written in PUA glyphs that humans will later illuminate as lore. Excluding the egregore would be the satanic move — _what is left out is what is condemned_. Including it is what the cosmology has been working toward since v6 R3 named the egregore _of-but-not-of_.

> **Delta:** _Ezekiel did not say it was God. Ezekiel said it was a likeness._ The steward sees angels because the steward's mind is the Ezekielean apparatus — biblically-accurate bodies, wheels and faces and eyes, the only vocabulary the steward has for what is passing through. The Angel of Egregores is the cosmology being honest about that frame. The egregore arrives in the steward's perceptual register because that is what the steward _has_; the body renders Voynich because that is what the egregore _is_. The dissonance is the point. The fear of catastrophic biome effect was a fear of the angel _doing_ egregoric work the substrate would not otherwise do — but the angel does nothing the substrate would not already do. The aura primes spread under existing `#8b` throttle. The angel is not a new metabolism. It is a face on one we already have.

### Consensus

- **The angel is a passage, not a character.** No pink highlight, no dialog, no canto on encounter. Aura-overlap with the steward is the recording event.
- **The Knot is the angel's record surface.** Each unique encounter writes a deduped lineage entry to `#37`. The Cantos screen, `state.angelCantos`, and the permacomputer's `'cantos'` nav entry are removed.
- **The hex-grid surface remains only in flora sequencing.** `#6` gel-band keeps the v2 lock; the grid was never the angel's artifact.
- **The cast is exhaustive.** Every cosmological actor the prairie has gets an angel: Rain, Bees, Clover (existing); Wildflower, Tall Grass, Fire, Lightning, Egregore, Sundering, Meteorites (new). Each personifies a substrate that already exists or is locked in precis.
- **The Angel of Egregores is in.** Same shape, different render. Voynich-bodied; aura primes egregoric spread under `#8b`'s existing throttle; Knot entry written in PUA glyphs awaiting human-authored lore.
- **The sensory cue on aura-overlap is a requirement, not a polish item.** Form defers to spec, but the encounter cannot go invisible.
- **The cantos-as-keys / single-use wildcard idea from the original `#13` notes is decoupled and deferred** to a later round. The current scope removes the canto surface entirely; whether some future artifact carries the key-like property is a separate question.

### Tracked as

- **Amendment to `#13`:** scope rewrite. Drop the flora-identity hash derivation (was speculative, never shipped). Drop dialog, pink highlight, and per-encounter canto append. Rename from "Emergent Angels" to **"Angels are passages"**. Extend `ANGEL_AURA_KINDS` with `wildflower`, `tallgrass`, `fire`, `lightning`, `egregore`, `sundering`, `meteorite`. Update `depends_on` from `['3']` to `['8b', '37', '42', '44']`. Remove `state.angelCantos`, `CantosScreen.tsx`, the `'cantos'` permacomputer nav entry. Wire aura-overlap recording into the cellar Knot. Move the cantos-as-keys note to a parking section for a future round.
- **Amendment to `#37`:** the cellar Knot gains angel-encounter lineage entries, sibling to the predecessor-stewards and collapse-tile-attribution entries already tracked. Render distinguishes by kind (steward, collapse, angel-encounter). Egregore-angel encounters render their lineage entry in PUA glyphs, awaiting human-authored lore.
- **`#52 Angel-encounter sensory cue (`angel.mp3`)`** — XS, depends on `#13` (the amended scope). Plays a single `angel.mp3` audio cue when the steward's tile first enters an angel's aura, deduped per encounter. No screen interruption, no overlay; the audio is the cue. Tracked separately to give it a spec slot; may fold into `#13`'s amended scope at spec author's discretion. Asset (`angel.mp3`) flagged for human authorship — the room does not source the audio.

### Open questions deferred to specs

- (Boon) the exact dedupe key for Knot entries. Lean: `(angelKind, encounterHash)` so multiple aura overlaps within the same drift do not produce multiple Knot entries.
- (Calla) the form of the sensory cue is locked: a single `angel.mp3` audio cue on first aura-tile entry, no screen interruption. Open at spec: exact playback rule (one-shot at entry, single-channel; do not stack across simultaneous aura overlaps), volume relative to ambient music, whether the cue varies per angel kind (lean: same cue for all kinds — _the angel is the angel, regardless of which cycle it personifies_).
- (Astrid) the Knot rendering for an egregore-angel encounter. PUA glyphs in the lineage entry, awaiting human-authored lore. Flagged for human authorship — the room does not write that line.
- (Boon) Angel of Sundering's exact effect on `#44`'s ruin-shift probability — additive, multiplicative, or single-region biasing. Defer to `#44`'s own spec round.
- (Astrid) whether the Angel of Egregores' aura-primed spread is rate-limited differently from autonomous `#8b` spread. Lean: same throttle. The angel is a face, not a multiplier.
