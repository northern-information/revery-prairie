# Precis thinktank — v9

A continuation of v7. v7 ran 4 rounds, locking lineage-as-record (not result), two-layer fog on the overworld, geological prairie bones with thermogenic egregores and lightning-driven wildfire, and the three-layer overlay system (Record / Thermal / Rhizome). v8 is concurrent work in another worktree, not yet merged at the time v9 opens; v9 is additive to v7 and will reconcile with v8 at merge if either round touches the same surface. v9 opens with a question Tyler brought to the room on 2026-05-23: _what if the player could bring items to Emily to incorporate into the Knots — buffs, like a Flask of Wondrous Physick — to figure out the replayability and build facets?_ The room walked the seed through three positions in one exchange — buff → offering → record — and landed on a sharper cosmological frame: the Knot is the camera that does not know, the witnesses are plural, and the cellar tells the steward what they missed.

What follows is the rounds. Decisions are stated as decisions. Open questions are flagged. v9 is _additive_ to v7 — it does not invalidate v7 unless a round here explicitly amends it. Items that should propagate back to earlier versions are tagged `**Amendment to v{N}:**`.

## The cast

Carried forward from v2/v3/v4/v5/v6/v7 with no changes:

- **Astrid** — vision purist.
- **Boon** — systems-first.
- **Calla** — player-experience pragmatist.
- **Delta** — late-arriving frame-breaker.

## Open and locked

**Locked in round 1:**

- **The Knot is auto-derived from the year's prairie state.** No steward handover, no curation surface, no offering pool. The `#49` slot vacates the same way `#12` did in v7 R1.
- **The Knot's witnesses are plural.** Steward (gaze + memory), Emily (radius around the little house), the coyote (its wander trail), the egregore-via-Gron (the patch's extent). The derivation walks the union of those footprints at the autumn tying tick.
- **v7 R2's fog lock is unchanged.** The fog gates the steward's rendering of the prairie. The Knot's derivation queries a broader witness-set without affecting what the steward sees in real time.
- **The cellar is a place of revelation, not just memorial.** Across years the steward learns what they missed — the wildfire on the northwest ridge they never reached, the egregore that crept on the southern slope unobserved. The revelation always arrives later, in a future year's cellar visit; never in the year of the event.
- **Witness provenance is internal.** The cellar's hover text reads events in the prairie's voice ("wildfire in the northwest, year 3") without an attribution gloss. The composite is the surface.
- **The cellar's richness is not a function of the steward's diligence.** A tenure that walked very little still has a full cellar — Emily watched, the coyote roamed, the egregore was.
- **Amendment to Astrid's earlier "tenure-bounded" framing:** the Knot is bounded by _witness_, not by tenure. The Knot is still uncurated; the witness set just expands beyond the steward.

**Locked in round 2:**

- **Time stops in domestic structures — the cellar (`#37`) and the little house (`#33`). Time does not stop in wild structures — the cave and the ruins.** The cosmological cut is _domestic vs wild_.
- **"Time stops" means the daylight clock (`state.timeOfDay`) and the seasonal progression clock (`state.season`) do not advance while the steward is inside a paused-structure zone.** The prairie's simulation tick continues at its normal rate — bees, ghosts, coyote, flora lifecycle, weather all keep running. v7 R2's lock holds: only the steward's clock pauses.
- **The cellar's cosmological framing: _memory does not tick_.** The cellar is the prairie's archive of itself; archives are not present tense.
- **The little house's cosmological framing: _home is the place that does not tick for the steward_.** Sleep continues to advance time via the Revery mechanic; non-sleep visits do not.
- **Re-entry to the prairie does not snap-advance.** The steward returns to the moment they entered.
- **Emily continues at the prairie's tick even while the steward is in the little house.** She is part of the prairie's simulation, not the steward's clock.

**Open in v9:**

- _(none yet — open questions are tracked on individual specs, not as v9 doctrine)_

---

## Round 1: what Emily and the coyote know

_Tyler: "what about things that happened in the prairie that the player didn't see? A distant patch of egregoric flora? A wildfire unseen? I have a suspicion Emily, Gron, and the coyote know about those."_

> **Astrid:** The previous draft of this round landed on a tenure-bounded Knot — uncurated, but bounded by the steward's gaze and memory. That was a partial truth that needed exactly this correction. The Knot is uncurated _and_ it is the prairie's, not the steward's, and those two together mean the witness set is plural. v7 R2's two-layer fog gates the steward's rendering of the prairie. It does not gate the prairie's own witnesses. Emily lives in the little house — a permanent fixture, watching out windows, having lived through more tenures than any steward will. The coyote walks the wild fringes the steward never reaches; the trickster's whole role is being where the steward isn't. Gron _is_ the egregore arriving at Revery — Gron knows the patch's spread because Gron is of the patch. Each is a different kind of permanence the steward is not. The Knot's witnesses are the union of those four — steward, Emily, coyote, egregore-via-Gron — and the cosmology gets _more_ consistent for being plural here, not less. _The eyes that read the year are not all the steward's._ The principle holds: events in the truly unseen prairie — unseen by any witness — do not enter the Knot. The Knot is still uncurated and still bounded by witness. The witness set just expanded.

> **Boon:** Mechanically this changes the derivation's input set, not its shape. Each witness has a spatial _footprint_ over the year; the union of footprints is what the derivation walks. Steward: gaze + memory (already exists in `visibility.ts`). Emily: a small fixed radius around the little house — call it ten tiles for now, defer the number to spec. Coyote: the coyote's actual wander trail through the year — needs a small persistent set on `state.coyoteWanderTrail`, one bit per tile per year, flushed at autumn tie. Egregore-via-Gron: the egregore patch's extent through the year, which is already tracked in `state.egregoreSpecimens` and the F-hold scan substrate. The derive function (`deriveKnotMaterials`) walks the union of those four footprints instead of the steward's alone. Witness provenance is _internal_ — the cellar's hover text reads "wildfire in the northwest, year 3" without attribution. The Knot speaks in the prairie's voice; the player doesn't need to know which witness sourced which entry. Net LOC: still small. One new persistent set, one footprint-union helper, the derivation extension. The room's earlier `#49` (steward-offering surface) was refused on cosmological grounds in the same exchange that produced this round; that slot stays vacated. All this is `#50`.

> **Calla:** This is the round's gift and Tyler felt it before the room named it. Today's cellar — bounded by the steward — would read like a journal: year 3 was the milkweed year, year 7 was the egregore year, all from your point of view. Honest but flat, because you already lived it. Adding the other witnesses transforms the cellar from memorial to revelation. Walk the row in year 8 and stop at year 3's Knot: _there was a wildfire on the northwest ridge that summer; you never walked there; the coyote did_. Stop at year 7: _the egregore patch on the southern slope advanced fourteen tiles that autumn; you were tending the milkweed corridor; you did not see_. The cellar teaches the steward what the prairie did out of sight. The session-feel of a thorough tenure changes — even completionist play has unseen events that show up in the cellar years later. The replayability deepens by an order of magnitude because every Knot has a side the steward did not face. _The cosmology hands the past forward through other eyes._ And the timing is its own beat: the revelation never arrives in the year of the event. It arrives later, in the cellar, when the steward is standing in front of an old Knot and the prose tells them a thing they did not know happened.

> **Delta:** _The cellar tells the steward what they missed across the unseen._ v7 R2 named that the prairie is bigger than the tenure's gaze; this round names how the cosmology repairs that asymmetry in the only way it can — across time, through other witnesses, in the cellar. The steward never closes the gap in real time. The gap closes retroactively, when the Knot is read in a later year. The witnesses Tyler named are exactly the right ones, and they map cleanly onto three different permanences the steward is not. Emily who stays. The coyote who wanders. The egregore who is. Each carries knowledge the steward cannot, and each contributes to the year's record without curation, without negotiation, without the steward's permission. The earlier instinct toward an "objective camera" was correct directionally; the correction is just that the objectivity is plural. _There is no single camera. The Knot is the composite._ One implication worth saying out loud: this means a tenure that walked very little prairie still has a full cellar at the end of it. Emily watched, the coyote roamed, the egregore was. The cellar fills regardless. The steward's footprint shapes how much of the Knot _is_ the steward, but the Knot is full either way. The cosmology refuses to make the cellar's richness a function of the steward's diligence. That is the line.

### Consensus

- The Knot's witness set is plural. Witnesses: the steward (gaze + memory), Emily (the little house's vicinity), the coyote (its wander trail), the egregore-via-Gron (the patch's extent). The derivation walks the union of those footprints at the autumn tying tick.
- v7 R2's two-layer fog is unchanged. The fog gates the steward's rendering of the prairie. The Knot's derivation queries a broader witness-set without affecting what the steward sees in real time.
- The cellar transforms from memorial to revelation. Across years the steward learns what they missed — the wildfire on the northwest ridge they never reached, the egregore that crept on the southern slope unobserved, the coyote-witnessed lightning strike that ignited nothing. _The cosmology hands the past forward through other eyes._
- The revelation always arrives _later_, in a future year's cellar visit. Never in the year of the event. The Knot picked up at autumn does not announce its contents; the cellar hover, years on, does.
- Witness provenance is internal. The prose reads the event in the prairie's voice ("wildfire in the northwest, year 3"); the player does not see an attribution gloss like "(coyote saw)". The composite is the surface.
- The cellar's richness is not a function of the steward's diligence. A tenure that walked very little still has a full cellar at its end — Emily watched, the coyote roamed, the egregore was. The steward's footprint shapes how much of the Knot _is_ the steward, but the Knot is full either way.
- The earlier draft's "bounded by tenure" framing amends: bounded by _witness_, not by tenure. The Knot is still uncurated; the witness set is the union of the four named witnesses.
- The room's earlier seed-handover surface (provisional `#49`) is refused on cosmological grounds — curation is the breeder in a smaller coat. The `#49` slot vacates the same way `#12` did in v7 R1.
- _The cellar tells the steward what they missed across the unseen._

### Tracked as

- **`#49` vacates.** The steward-offering surface is refused; the id slot vacates. No replacement.
- **`#50 Knot per-year auto-derivation`** — M, depends on `#36`, `#46`. Auto-derived `materials` bag computed at autumn tie from the union of witness footprints: steward (gaze + memory), Emily (radius around little house), coyote (wander trail), egregore (patch extent). Surfaces in inventory glyph perturbation, cellar hover, and manual entry texture. The cellar hover is the surface that teaches the steward what they missed.
- **Amendment to `#36`:** the open question on per-year variation closes — auto-derived from the witness-union, not the steward alone. Pressure contribution to `#32` is unchanged. Pickup has no stat surface beyond the existing scalar.
- **Amendment to `#46`:** the auto-annotation substrate is shared with `#50`. Lineage-as-target stays `#46`'s primary case; year-as-target (via witness-union) is the sibling case under `#50`. The two specs should share a `deriveAnnotations` foundation, not duplicate it.
- **Amendment to `#37` (light):** the cellar's role formalizes from memorial to revelation surface. The hover text on year-N's Knot reads year-N's plural-witness record. No structural change to the cellar zone; the new behavior lives in the Knot's `materials` bag and is rendered at the cellar's existing hover surface.
- **Amendment to `#26` (coyote substrate — verify owner at spec):** adds a per-year `coyoteWanderTrail` persistent set, flushed at autumn tie. Small new state field; rides on `#50`'s spec rather than spawning a sibling precis.

### Open questions deferred to specs

- (Boon) Coyote wander-trail granularity — track every tile the coyote occupies, or sample? Lean: every tile; one bit per tile per year is cheap and the trail is a load-bearing input.
- (Astrid) Emily's footprint radius around the little house. Lean: ten tiles, defer to spec. Open whether Emily's footprint should grow over tenures (the longer she's lived in the house, the more she's noticed). Probably no — Emily's character isn't an expanding gaze; it's a steady one.
- (Calla) Whether the cellar hover ever names the gap explicitly — "you did not see this" — or only renders the event in prose without acknowledgment. Lean: no acknowledgment. The steward notices the gap themselves. The prose is the prairie's voice, not the cellar's editorial voice.
- (Delta) Whether Gron's _arrival_ at Revery contributes to that year's Knot post-hoc. Lean: no. The Knot is autumn-tied, before Gron arrives. Gron's contribution to _this year's_ Knot is what the patch witnessed before Gron's arrival; Gron's arrival itself is `#32`'s substrate for next year's spread.
- (Boon) Order-of-events: if two witnesses see the same event, do we record it once or twice? Lean: once. Events are state-level facts; the witness union resolves to a set of events, not a multiset of perspectives.
- (Astrid) Voice constraint for cellar hover prose around metabolic / egregoric events — must bend toward _of-but-not-of_ register (per v6 R8), never _invasive_ (CI-guarded ban). Flag for human lore author.
- (Calla) Whether the steward can ever _see_ the egregore's footprint or coyote's trail directly (a hidden overlay, a stat readout) — or whether the only path to that knowledge is reading the cellar. Lean: only the cellar. The other witnesses' knowledge belongs to them; the cellar is the surface where it reaches the steward.

---

## Round 2: memory does not tick

_Tyler: "if the cellar is becoming this sort of hall of records I think time should stop there. It's already a quite brisk pace when you're in the overworld... maybe time stops whenever you're in a structure? I'd like to be able to read the Knots without the pressure of losing daylight."_

> **Astrid:** The instinct lands on a cosmological seam the design has been quietly leaning against. v7 Round 2 locked that the prairie's simulation never pauses — _the trees do not stop when no one is in the forest_. That holds. The Knot was just locked in Round 1 as the prairie's plural witness across a year. Now Tyler is asking what kind of space the cellar _is_ relative to the rest of the prairie. The clean answer is the one the cellar's own architecture has been pointing at since v6: the cellar is _memory_, and memory does not tick. The cellar is not a place inside the prairie's time; it is the place where the prairie's time is recorded. To enter the cellar is to enter the prairie's archive of itself, and archives are not present tense. _The cellar is the only place the prairie holds still, and it holds still because it is no longer the prairie — it is the prairie's record of itself._ The little house borrows from the same logic by a softer route: home is the place that does not tick for the steward. The cave and the ruins are the prairie's wild interior; they keep ticking because the steward is not at home in them. The cosmological cut is _domestic vs wild_: the homestead does not tick, the wild does.

> **Boon:** The engine partitions cleanly here. There are three clocks: (1) the daylight clock — `state.timeOfDay`, what Tyler is calling pressure; (2) the seasonal progression clock — `state.season`; (3) the prairie's simulation tick — bees flying, ghosts drifting, the coyote walking its trail, flora lifecycle, weather. Tyler's concern is clocks one and two. The honest implementation is: a `pausesPlayerTime: boolean` on the zone definition, true for the cellar (`#37`) and the little house (`#33`), false for the cave and the ruin. While inside a paused-structure zone, the daylight clock and season clock do not advance. The simulation tick continues at its normal rate — v7 R2 stays satisfied because the prairie keeps simulating; the steward just isn't watching. On exit there is no snap-advance — the steward returns to the moment they entered. Files in play: zone definition, the time-of-day tick, the season tick. Net LOC is trivial — maybe twenty. _The clocks were already partitioned; this just gates two of them on zone._ One audit note: any system that derives behavior from `timeOfDay` while the steward is in a paused structure needs a sanity pass — but those systems are already running on the prairie's tick, not the steward's, so the risk is small.

> **Calla:** The session feel asks for this and the cosmology should give it. The overworld is _intentionally brisk_ — daylight is finite, seasons advance, tending has a window, and that pressure is exactly what makes tending a verb. The cellar is the opposite mode by design. The whole point of the cellar Round 1 just unlocked is that the steward walks the row, stops at an old Knot, and reads back what the coyote saw or what the egregore did unobserved. That is a stand-and-look mode, not a glance mode. Trying to do that under daylight pressure would corrupt the cellar's role — every reading would be cut short by the prairie's clock. The little house follows the same logic for a different reason: home is not where the steward tends. Sleep already advances time via the Revery mechanic; a non-sleep visit (sitting at the table, picking something off the bed, talking with Emily) should not cost daylight. The cave and the ruins are the right exclusions — they are exploration spaces, and the time pressure is part of their texture. _Brisk where the steward tends; still where the steward is home._

> **Delta:** _Memory does not tick._ That is the line, and it is more than a game-feel concession — it is the cosmology declaring what kind of space the cellar is. To stand in front of an old Knot and read what the coyote saw three years ago, while the present prairie's clock advances minute by minute, would be incoherent. The two registers cannot share a clock. The cellar is _outside_ the present tense by construction; that is what makes it the archive and not another room. The little house is a softer cognate: home is also outside the prairie's pressure, because home is where the steward is not tending. The cosmology has been quietly waiting for a definition of home in a game where the prairie outlasts every steward; this round gives one. _Home is the place that does not tick for you._ That is the only definition this cosmology allows, and it is the same reason the cellar holds still. The cave is not home. The ruin is not home. The cliffs are not home. The little house and the cellar are, and they are the only two. _The clocks belong to the prairie. The prairie does not run in the rooms where the steward is not tending it._

### Consensus

- Time stops in **domestic structures** — the cellar (`#37`) and the little house (`#33`). Time does **not** stop in **wild structures** — the cave and the ruins. The cosmological cut is _domestic vs wild_.
- "Time stops" means the daylight clock (`state.timeOfDay`) and the seasonal progression clock (`state.season`) do not advance while the steward is inside a paused-structure zone. The prairie's simulation tick continues at its normal rate — bees, ghosts, coyote, flora lifecycle, weather. v7 R2's lock holds: _the trees do not stop when no one is in the forest._ Only the steward's clock pauses.
- The cellar's cosmological framing: _memory does not tick_. The cellar is the prairie's archive of itself; archives are not present tense.
- The little house's cosmological framing: _home is the place that does not tick for the steward_. Sleep still advances time via the Revery mechanic; non-sleep visits do not.
- The cave and the ruins remain time-flowing. The prairie's wild interior keeps its clock.
- Re-entry to the prairie does not snap-advance. The steward returns to the moment they entered.
- Emily continues at the prairie's tick even while the steward is in the little house. She is part of the prairie's simulation, not the steward's clock.
- _Memory does not tick._

### Tracked as

- **`#51 Time stops in domestic structures`** — S, depends on `#33`, `#37`. A `pausesPlayerTime` flag on zone definitions. True for the cellar and the little house; false for the cave and the ruin. While inside, `state.timeOfDay` and `state.season` do not advance. The prairie's simulation tick continues at its normal rate. Re-entry does not snap-advance — the steward returns to the moment they entered.
- **Amendment to `#33`:** the little house gains `pausesPlayerTime: true`. Sleep continues to advance time via the Revery mechanic; non-sleep visits do not cost daylight. Reading the bed-Knot during its working winter is a contemplation surface that does not consume the steward's tending window.
- **Amendment to `#37`:** the cellar gains `pausesPlayerTime: true`. Reading Knots is contemplation; the cellar is for stand-and-look, not glance. Cosmological framing locked as _memory does not tick_.

### Open questions deferred to specs

- (Boon) Whether any clocks beyond `timeOfDay` and `season` need to be audited for player-derived behavior — NPC dialogue cooldowns, hunger/fatigue if they exist, recipe timers. Lean: only the two player-facing clocks pause; all NPC and flora clocks run on the prairie's tick and continue. Audit during `#51` spec.
- (Astrid) Whether the visual treatment inside paused-structures should _feel_ the temporal pause — the rectangle of light through the cellar bulkhead frozen at the angle of entry, ambient audio held at its entry-moment level, particle motion stilled. Lean: yes, subtly. The pause should be felt, not announced.
- (Calla) Whether exiting a paused structure shows any cue that time has not advanced — a UI flicker, a small sound, nothing. Lean: nothing. The prairie's clock was always going to be there when the steward came out; cueing the pause would break its naturalness.
- (Delta) Whether future domestic spaces (a barn, a porch, a greenhouse) should inherit `pausesPlayerTime` automatically, or whether the design re-asks the question per space. Lean: the principle is the test — domestic vs wild — and each new space gets asked. Don't build a default that auto-classifies; the cut is meaningful and should be drawn deliberately.
- (Boon) Performance — does freezing the time-of-day tick risk de-syncing anything that depends on it via cached deltas (sun position cache, render-pass schedule)? Audit at `#51` spec. Likely small.
- (Astrid) Whether Emily's behavior inside the little house pauses too (she sits stationary while the steward is in her room) or continues her routine. Lean: she continues at the prairie's tick — she is part of the prairie's simulation, not the steward's clock. The little house pauses time _for the steward_, not for Emily.
