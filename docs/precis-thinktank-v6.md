# Precis thinktank — v6

A continuation of v5. v5 ran rounds 1–2, locked the diamond-is-the-world coordinate frame and the unreadable-does-not-announce-its-source doctrine. v6 picks up after v5 with a new arc, sparked by a question Tyler brought to the room on 2026-05-22: _why does the steward need to enter revery?_ The room found that the omen's fragility (`src/engine/omen.ts:28-62`, five gates and three OR'd predicates) was the surface of a deeper question — what is the steward, why do they sleep, and who waits with them.

What follows is the rounds. Decisions are stated as decisions. Open questions are flagged. v6 is _additive_ to v5 — it does not invalidate v5 unless a round here explicitly amends it. Items that should propagate back to v4 or v5 are tagged `**Amendment to v{N}:**`.

## The cast

Carried forward from v2/v3/v4/v5 with no changes:

- **Astrid** — vision purist.
- **Boon** — systems-first.
- **Calla** — player-experience pragmatist.
- **Delta** — late-arriving frame-breaker.

## Open and locked

**Locked in v6:**

- **The Revery enters the steward, not the other way around.** The Revery is a force, not a verb the steward conjugates. The cosmology's direction is fixed.
- **The steward sleeps because the prairie sleeps.** The steward is _of the prairie_, subject to the same seasonal verbs as the clover and the egregore. No biography for the steward; the cosmology is the answer to _why_.
- **The steward is the only untagged entity in the cosmology, and that is the design.** Person / cyborg / spirit is the wrong question. _The unchanged thing in a world made of change does not need to be sorted by category. It is sorted by its function._
- **The omen variants from `#4` are signals, not direct triggers.** The fragility of the OR'd-predicate model is replaced by a pressure accumulator that always reaches threshold across autumn.
- **The deadline is the winter solstice.** Pressure ceilings at the solstice frame, not the first winter frame. Tyler's canonical refrain locks: _you will be back before the solstice, to revery._
- **The Revery has two complementary triggers: invitation and summons.** Invitation is the steward's pilgrimage to the little house; summons is collapse-in-place when the steward has not committed by the solstice.
- **The cosmology does not drag the steward home.** The summons is the omen at full volume from where the steward stands. _The prairie sleeps the steward where the steward stands._
- **The tenure begins in dormancy and ends in dormancy.** The steward starts the game inside the little house just-woken and (per `#16`) ends the tenure in the same place going dormant for the last time. _The steward begins where the steward will end. The little house is the cycle's hinge._
- **The genesis sequence (`#27`) is reframable as the dormancy the steward is just waking from.** The permacomputer back-derives the world during the sleep; the steward wakes into what it produced. Doctrinal only; no in-game text change.
- **The little house is the cosmology's one always-open surface.** Open all year, the girl waits inside; her dialog register matches the `#21` round 5 Gron doctrine.
- **The girl and Gron are a cosmological pair: _the unchanged thing that waits_ and _the unchanged thing that travels_.** Two surfaces of the cosmology's continuity layer. The girl waits in the house; Gron arrives at the field summons.
- **The cosmology speaks through characters, not through chrome.** A story-shaped moment that wants narration finds a character to carry the meaning instead. No narrator, no HUD text, no UI gloss for the Revery's summons. Extends the v4 round 9 diegetic test to character-as-surface.
- **The Kojima-shaped input hijack is held in reserve for the final tenure-end Revery (`#16`).** Not used for annual summons.

**Open in v6:**

- _(none yet — open questions are tracked on individual specs, not as v6 doctrine)_

---

## Round 1: why does the steward sleep

_Tyler: "i think we need to revisit the omen. in practice it feels fragile, and this is a really powerful moment where we could introduce tension. we haven't talked about the steward themself — i don't know if it is a person or a cyborg or a spirit. why does the steward need to enter revery?"_

> **Astrid:** The room has been circling the steward and never naming them, and the reason is that the cosmology already names them — _of the prairie_. The flora go dormant when conditions demand it. The egregore inverts to its own dormancy. The bees consolidate to the hive. The steward sleeps because the prairie sleeps. _The revery alone will do, if bees are few_ — Dickinson did not write that the steward chooses the revery. She wrote that the revery is sufficient, and she meant it as a force, not a verb the steward conjugates. The current omen treats the Revery as a thing that arrives by chance; that is the fragility Tyler is naming, but it is the wrong axis. The Revery is not a chance event. It is the steward's winter. The trigger should be of the same kind as flora's dormancy — a cosmological pressure that the steward can no longer refuse. Do not give the steward a biography to explain why they sleep. Give them the same answer the clover has.

> **Boon:** The omen lives in `src/engine/omen.ts:28-62`. Five gates and three OR'd predicates — bee on shoulder, distant meteorite, cloud passing the sun. The fragility is structural: three rare predicates over a single season can roll zero hits across an entire autumn. The fix is to keep the predicates as _signals_ and add an accumulator. Proposed shape: `state.player.dormancyPressure: number`, monotonically increasing across autumn, with each detected omen variant contributing a bounded scalar. Pressure crossing a threshold — call it `DORMANCY_THRESHOLD` — sets `state.revery.phase = 'omen'` automatically. The deadline is the autumn → winter boundary; the first winter frame raises pressure to ceiling no matter what. The opt-in is a material commit that adds pressure directly to threshold — one item use, the Revery enters next frame. Sibling field to `state.cosmologicalDrift` (`#4` spec, currently 0-baselined). Pressure is per-tenure, reset on Revery completion alongside `lastReveryEndTime`. The forcing function is small: one new state field, one accumulator tick in autumn, one threshold check. The opt-in is whatever shape the room decides — wearable per `#15`, single-use, or a tile-bound location. Same trigger logic on the engine side either way.

> **Calla:** What this changes is the shape of an autumn. Today autumn is a roll of the dice — the player notices the leaves turn, hopes a bee or a meteorite or a cloud finds them, and sometimes nothing comes. That is the wrong feeling. Autumn should be a held breath. The pressure model gives every autumn a known terminus: the steward _will_ sleep before the first snow. The invitation is the steward saying _I will lie down before the prairie does it to me_. The summons is the prairie running out of patience. Both should ship. The invitation feels calm — the player walks to the place or carries the item and chooses the hour. The summons feels like the wind picking up. The pressure should be _readable_, in the diegetic-test sense — not a HUD bar, but something the steward can read in the world. The almanac line on the permacomputer (`#28`) is the obvious surface: an instrument that reports a coming storm by showing where the needle is now. Late autumn, the needle is past the line. The session-shape gain is enormous. No autumn is ever wasted to a bad dice roll. The Revery becomes a thing the player schedules against, not a thing they pray for.

> **Delta:** The steward is the only entity in the prairie that has not declared what kind of thing it is. Bees are tagged. Ghosts are tagged. Flora carry species. Egregores have their parallel register. Even Gron has a tag, however oblique. The steward is untagged, and the cosmology has a word for untagged: _not yet sorted by death_. The Revery is the prairie's sorting mechanism. Person, cyborg, spirit — the question is the wrong shape. The steward is what the prairie's verbs do to it. The verb here is _sleep_, and the answer to _why_ is the same as the answer for the clover: because the prairie sleeps, and the steward is of the prairie. Do not declare the steward's nature. Refusing to declare it is the declaration. The line to take forward: _the steward does not enter the Revery; the Revery enters the steward._ The pressure system is that line in code. The opt-in is the steward's last courtesy before being taken.

### Consensus

- The Revery has two complementary triggers: a player-opt-in (material item or tile-bound location) and a cosmological forcing function (autumn-borne pressure crossing a threshold by the first winter frame).
- The three existing omen variants (bee on shoulder, distant meteorite, cloud passing the sun) are retained as _signals_ that contribute to pressure, not as direct triggers. The fragility goes away because no autumn can finish without the Revery happening.
- Symmetry with flora dormancy is load-bearing. The steward sleeps because the prairie sleeps. The steward is _of the prairie_, subject to the prairie's seasonal verbs.
- The steward's nature (person / cyborg / spirit) is preserved by _not_ declaring it. The steward is the only untagged entity in the cosmology and that is the design. The round refuses to add a biography.
- The opt-in is the invitation; the forcing is the summons. Both ship. Calm at one end, the wind picking up at the other.
- Pressure is readable in the world via the permacomputer almanac (`#28`), in the instrument register — needle position, not HUD bar. No new chrome.

### Tracked as

- **`#32 Revery dormancy pressure (forcing function)`** — replace omen-as-direct-trigger with a `state.player.dormancyPressure` accumulator that climbs in autumn, with the three existing omen variants contributing bounded scalar inputs. Threshold crossing schedules the Revery; first winter frame ceilings pressure no matter what. Depends on `#4` (shipped) as the amendment substrate. Reads out on the permacomputer almanac under `#28`.
- **`#33 Revery opt-in object`** — a material surface that lets the steward commit pressure to threshold on the steward's schedule. Shape deferred to spec: wearable item that the player carries through autumn (with `#15` wear coupling), single-use seasonal consumable, or a tile-bound location the steward walks to. Whichever shape, the engine effect is the same: one use, pressure → threshold, Revery on next frame. Depends on `#32`.
- **Amendment to `#4`:** the omen-direct-trigger model is replaced by pressure-contribution. `detectOmen` (`src/engine/omen.ts:28`) keeps returning `OmenKind | null` but the return is consumed by the pressure accumulator, not by `initiateRevery` directly. The cooldown gate (`REVERY_COOLDOWN_MS`) moves to a pressure-accumulator gate; same semantic.

### Open questions deferred to specs

- (Boon) Pressure curve shape — linear across autumn or accelerating in late autumn? Per-tick increment or per-day? Scalar contribution per omen variant — are they equal, or weighted by rarity?
- (Calla) The opt-in object's identity. Wearable item (couples to `#15`), single-use seasonal consumable (e.g. a "dormancy bough" harvested at autumn entry), or a tile-bound location (e.g. a moss bed under a particular oak). Each has different session-shape. Bias from the room: the opt-in should feel _carried_ rather than _found_, but no lock.
- (Astrid) Is the steward's untagged nature expressed anywhere visible, or is the absence itself the expression? Default: absence. Flag if a future surface needs to render the steward and finds the slot empty.
- (Delta) At threshold crossing, does the forcing pick the highest-contributing omen variant for the staging frame (so the player sees _the bee on the shoulder_ even if pressure also accumulated from meteorites and clouds), or does it stage with a generic "first snow" omen kind? Lean toward highest-contributing for continuity.
- (Boon) Should the cooldown gate stay one year exactly, or should it become "one autumn"? Today's cooldown could allow two Reveries in a year if autumn enters early; pressure-based, this stops being possible by construction. Possibly the gate is just deleted.

---

## Round 2: the little house

_Tyler: "a young girl in 'the little house' — perhaps she invites the steward in to revery with her. the house is open all year and her dialog is plain but somewhat ominous. 'you will be back before the solstice, to revery.'"_

> **Astrid:** The opt-in needed a surface and Tyler has handed the room the one that fits. The little house is _of the prairie_ in the same way the steward is — without origin, without biography, without an explanation owed to anyone. Her dialog register is Round 5 Gron doctrine, transposed for a younger voice: statements not questions, no contractions, no editorial affect, no opinion of the steward. _"You will be back before the solstice, to revery"_ — read that line again. It is a fact stated, not a wish. She does not hope the steward returns. She knows. The doctrine of irreducibility carries: no origin for the girl, no canonical explanation of the house. She is there because the prairie produced her, the same way it produced the egregore script, the same way it produced the steward. Do not give her a name in the spec unless the room's later rounds find a name has earned its place. The prairie's nameless surfaces are the prairie's most powerful surfaces.

> **Boon:** Substrate-cheap. The house is a tile or a small structure footprint, sibling to the cave entrance in the existing zone-transition system but without the zone swap — the interior, if there is one, can live as an overlay or as a small interior zone. The girl is a character entity, registered in `src/engine/characters.ts` with the four-line dialog constants (`LITTLE_HOUSE_DIALOG_SPRING`, `_SUMMER`, `_AUTUMN`, `_WINTER` or whatever pattern matches Moab's existing one at `src/engine/characters.ts:98-110`). The opt-in mechanic is the standard `[f]` interact key. The dialog presents a confirm option, the confirm sets `state.player.dormancyPressure = DORMANCY_THRESHOLD`, the next frame the Revery enters via the `#32` accumulator path. No new components, no new systems — this is the existing dialog + interaction surfaces with a new tile and a new constant block. The house being open all year means no seasonal gate on the interaction; the seasonal change lives entirely in which dialog constant the dispatcher selects, mirroring Moab's existing season-routed dispatcher from `#9a`. Engine cost: small. The expense is the visual asset (the house glyph) and the dialog authoring.

> **Calla:** This is what the opt-in needed to be. An item would have been transactional — _use the bough, sleep follows_. A place with a person is a _visit_. The session shape is now: every autumn, the steward makes a pilgrimage to the little house. The visit is the only voluntary social ritual the steward has — Moab is doing his burns, Gron seeds bees, the coyote follows on its own logic. The girl is the only one who _waits_. Tyler named the load-bearing word. _She waits._ The dialog being plain but ominous gives the visit its charge: the steward arrives, the girl is exactly where she was last autumn, exactly as she was, and she states the fact of the coming sleep before the steward has admitted it to themself. The held-breath autumn from Round 1 has a destination. The forcing function from Round 1 is still there — late autumn pressure climbs, the prairie summons — but most stewards, most tenures, will choose the invitation. The summons becomes the cosmology's fallback, not its norm. _The summons exists so the invitation can mean something._ And the seasonal dialog dial is a quiet gift: in spring, summer, early autumn, she does not yet say the line. The steward who knocks early is told something else. The line arrives when the prairie is ready to be slept through.

> **Delta:** The little house is the only place in the prairie that does not change. Flora go dormant in winter; the egregore inverts to its own dormancy; the bees return to the hive; the coyote roams; Moab disappears into the cave. The little house is open all year. The girl is there all year. This is the cosmology's one fixed point — _the unchanged thing in a world made of change_. Her prescience is procedural, not supernatural: she knows the steward will return before the solstice because the `#32` pressure system will force it, and she is the surface the pressure speaks through. _The house is the almanac with a voice._ The permacomputer's almanac line under `#28` reads the world to the steward; the girl reads the world to the steward in language. Both surfaces, same instrument. The girl is what an instrument sounds like when the cosmology gives one a throat. Do not declare what kind of thing she is — person, ghost, spirit, none-of-the-above. The cosmology has the same rule for her as it has for the steward. _The unchanged thing in a world made of change does not need to be sorted by category. It is sorted by its function: it waits._

### Consensus

- The opt-in surface for the Revery is **the little house** — a tile-bound location with a girl who invites. Resolves Round 1's open question on opt-in object identity.
- The house is open all year. The interaction has no seasonal gate. The seasonality lives entirely in the dialog dispatcher.
- The girl's dialog register matches Round 5 Gron doctrine: statements not questions, no contractions, no editorial affect, no opinion of the steward. Plain but ominous as autumn deepens.
- Tyler's canonical late-autumn refrain — _"you will be back before the solstice, to revery"_ — is locked as her late-autumn line. Other dialog content is human-authored lore; the round names the register but does not author the lines.
- Confirming the invitation commits dormancy pressure (`#32`) directly to threshold; the Revery enters on the next frame.
- The girl Reveries alongside the steward (default reading of Tyler's "with her"). Interpretation: she goes dormant in a chair across the room while the steward sleeps in the offered bed. Both wake at the same moment.
- The girl has no origin and no name in the spec. The house is its own explanation. _The unchanged thing in a world made of change does not need to be sorted by category._

### Tracked as

- **Amendment to `#33`:** the opt-in object is the little house and the girl. Update `#33`'s summary and notes accordingly. No new item — `#33` carries the spec; the round names the shape. The engine effect from Round 1 stands: one confirm, pressure → threshold, Revery on next frame.
- **Reference to `#21`:** the Round 5 Gron dialog doctrine extends to the girl. Same register. Do not lift Gron's lines, but the constraints — no contractions, statements not questions, no editorial affect, no opinion of the steward — apply.
- **Reference to `#16`:** open question deferred to spec — does the girl acknowledge predecessor stewards? She is the unchanged surface; she has seen them all. Lean toward acknowledgment-without-opinion. Spec author's call.

### Open questions deferred to specs

- (Astrid) The girl's name. Lean: nameless until a name earns its place. The spec author may surface a name later or hold the line.
- (Calla) The house's location in the world. Findable from spawn or requires walking? Visible from a distance? Bias from the room: findable but not central. The steward should _arrive_ at the house, not stumble onto it.
- (Boon) Visual glyph for the house and for the girl. Multi-tile structure vs single tile. Interior overlay vs interior zone swap. Spec author's call against existing zone-transition substrate.
- (Calla / Astrid) Whether the steward can enter the house and decline. Lean yes — entering is not committing. Confirming is committing. Walking in and out without confirm is a quiet visit; the player can use the house as a place to read the season's dialog without being forced to sleep.
- (Delta) Does the girl acknowledge predecessor stewards in any dialog branch (per `#16`)? She has waited through their tenures too. Lean toward a single oblique acknowledgment under a late-tenure condition, not a general dialog feature. Spec author's call.
- (Astrid) Late-tenure handoff dialog — when the steward's drift approaches the threshold from `#16`, does the girl's dialog shift? She is the unchanged surface; the steward is the changed one. Possible that her line at handoff is the same line she has always said, and that fact is the lineage payload. Defer.

---

## Round 3: the steward wakes in the little house

_Tyler: "what if the steward starts the game in the little house, and the first character they happen upon is the girl? cliché to start the story upon awakening, but the arguments are strong here. it will make emerging into the prairie for the first time more impactful. classic film and game move: start claustrophobic, open up the world."_

> **Astrid:** The cosmology has been waiting for this. The tenure is the unit; the Revery is the steward's dormancy; the little house is the unchanged surface. Now the tenure begins where the tenure will end — in the little house, in sleep just-finished or sleep just-arriving. The steward is bookended by dormancy on both sides, the same way a seed is bookended by dormancy on both sides. _The tenure is a cycle, and the cycle has a hinge._ The cliché Tyler named — _start with the awakening_ — is not borrowed here, it is _earned_, because the game's grammar is sleep-and-wake at every scale. The flora go dormant and wake. The egregore inverts and wakes. The bees consolidate to the hive and emerge. The steward sleeps and wakes through the Revery cycle. The opening is the first beat of the grammar the game already runs. Lock: the steward begins in dormancy and ends in dormancy. The cosmology does not budge on this anymore.

> **Boon:** Engine cost: small once `#33` ships. Player spawn currently lands somewhere in the prairie via `player-spawn` logic; this work routes the spawn tile into the little house interior. The genesis handoff in `genesisRenderer.ts` currently ends with the player on the prairie; the handoff target moves to a known interior tile within the house. The house interior either lives as a small zone (sibling to the cave's `zoneTransition.ts` substrate) or as an overlay over a footprint of overworld tiles — spec author's call, neither is expensive. The camera frames the interior on spawn. The first door-cross is a normal walk over a structure boundary — no special cinematic, no pan, no fade. The impact comes from the contrast between what the player has been looking at (an enclosed handful of tiles) and what they walk into (the full prairie). The cost is the visual asset for the interior and one routing change to spawn.

> **Calla:** This is the opening the game wanted. Most games dump the player into the world cold and trust the first thirty seconds to land; this one earns those thirty seconds by giving them shape. Wake, gain control, see one person across a small room, walk a few tiles, interact for one dialog beat, find the door, push through. The player has now learned the dialog register before the prairie speaks, and the prairie has reserved itself for the emergence. Tyler's cliché concern is real but the cliché is correct here because the game's whole rhythm is sleep-and-wake; the opening is not borrowing the trope, it is _running it_. Players will remember the door. They will remember the girl. They will remember walking out the first time. And in late autumn, when they walk back to commit to the Revery, the return will close a circle the player has been carrying since session one. The session-shape gift is that the little house is now load-bearing for the player's whole memory of the tenure, not just an autumn pilgrimage.

> **Delta:** The cliché is not a problem because the cliché is correct. The cosmology is cyclic — the steward is woven into cycles at every scale — and the opening of a cyclic game is a wake-up beat. The deeper move Tyler has just made is to the genesis sequence. If the steward wakes _from_ a sleep at the opening, that sleep is the genesis sequence. The 14 epochs of cosmic history that the permacomputer back-derives in `#27` are now interpretable as the dormancy the steward is just finishing — the world is what the permacomputer reconstructed during the sleep, and the steward wakes into the world that reconstruction produced. The girl, of course, was awake the whole time. She is the unchanged surface. _The genesis screen is the dormancy the steward just slept through._ Carry the line forward: _the steward begins where the steward will end, and the little house is the hinge._

### Consensus

- The steward starts the game inside the little house. The girl is the first character the steward encounters.
- The steward's tenure begins in dormancy (just-woken) and ends in dormancy (final sleep, per `#16`). The little house is the location of both bookends.
- The genesis sequence (`#27`) reframes structurally as the dormancy the steward is just waking from. The permacomputer back-derives the world during the sleep; the steward wakes into what it produced. No in-game text change required; the reframe is internal doctrine plus a comment in `genesis.ts`.
- The cliché of starting-on-awakening is doctrinally earned because the game's whole grammar is sleep-and-wake at every scale. The opening is the first beat of the grammar, not a borrowed trope.
- Cinematic opening: small enclosed interior, one person, one dialog beat, one door. The emergence onto the prairie is a normal walk through a boundary; the impact comes from contrast, not from a special cinematic. _Standard renderer; doctrinal contrast._
- The little house is now load-bearing for the entire tenure's memory shape — it carries the player's first thirty seconds, every autumn return, and the final handoff.

### Tracked as

- **`#34 The tenure opens in the little house`** — spawn the steward inside the little house at tenure start; the girl is the first character met; the genesis sequence (`#27`) handoff routes into the house interior rather than the open prairie. First emergence onto the prairie is a normal walk through the door; no special pan or fade. Depends on `#33` (the house must exist as the opt-in surface) and `#27` (genesis handoff target moves into the interior).
- **Amendment to `#27`:** the genesis sequence reframes as the dormancy the steward is waking from. The permacomputer back-derived the world during the sleep; the steward wakes into what it produced. Handoff target at end of genesis lands in the house interior. No in-game text change; reframing lives in doctrine + a comment in `genesis.ts`.
- **Reference to `#16`:** the tenure-end handoff also occurs in the little house — symmetric bookends. `#16`'s spec should account for ending where the steward began. The girl is the witness at both bookends.

### Open questions deferred to specs

- (Boon) Interior implementation — small zone (sibling to the cave system) or overlay over a footprint of overworld tiles? Either works; spec author's call against existing `zoneTransition.ts` substrate.
- (Calla) Whether the house interior carries any tutorial-shaped affordance (signage, a tile that teaches an action). Lean: no. The dialog and the door are the entire onboarding. The prairie itself teaches the rest.
- (Astrid) Does the girl ever leave the house? Lean: never. She is the unchanged surface. Confirm at spec.
- (Calla) The girl's first-encounter dialog line. Tyler locked the late-autumn refrain in Round 2 (_"you will be back before the solstice, to revery"_); the first-encounter line is open. Flagged for human authoring per dialog/lore doctrine. Spec author marks `MANUAL_LORE[character:little-house-girl]` (or equivalent) as TODO.
- (Boon) Multiplayer interaction with spawn. In a shared prairie, do all stewards spawn in the same house? Each in their own? Lean: spec author defers to `#16`'s lineage framing — the little house is per-tenure, not per-prairie-instance. But this is an open seam.
- (Delta) Does the genesis screen get any signal that it is the previous Revery — visually, structurally, or just in doctrine? Lean: doctrine only. The permacomputer's reverse-projection register from `#27` is already correct for the reframe; no new pixels needed.
- (Astrid) The girl's first words to a steward who has never met her — does she greet with the dialog register established in Round 2 (statements, no contractions, no editorial affect), or does the first encounter get a different shape because no prior context exists? Lean: same register from frame one. The cosmology does not soften.

---

## Round 4: the prairie sleeps the steward where the steward stands

_Tyler: "what happens on the solstice? does the player teleport to the little house? do we go a little meta and kojima and hijack all wasd to route the player back to the little house?"_

> **Astrid:** Reject the teleport. The cosmology does not move bodies through space without their participation — that is magic, not cosmology, and the prairie has none of the former. The steward is _of the prairie_; the steward sleeps where the prairie sleeps them. Clover does not migrate to a bed before going dormant, and neither does the steward. The omen variants the room locked in `#4` are not waste once `#32`'s pressure system absorbs them — they accumulate the pressure, yes, and then at the solstice, _they speak again_. The cosmology has been whispering all autumn through the bee on the shoulder, the meteorite landing nearby, the sky tearing cloud to sun. The summons is those whispers played at full volume from where the steward stands. The girl is not the prairie's bailiff; she is the prairie's invitation. The invitation declined is the invitation declined, and the cosmology sleeps the steward anyway. _The unchanged surface waits. The summons does not drag the steward to it._

> **Boon:** The implementation costs are not symmetric.
>
> Teleport — trivial. One state change. Doctrinally wrong but cheap.
>
> Input hijack — expensive and brittle. Pathfinding override, input routing layer, edge cases everywhere: steward is in the cave, steward is on a tile with no path to the house, steward is mid-interaction with another character, steward is dragging an item. Every one of those is a special case. Possibly hundreds of LOC to do correctly.
>
> Collapse in place — trivial. `initiateRevery(state, time)` already enters the Revery from the steward's current tile in `#4`'s staging path; only the trigger source changes. The high-intensity omen variant is the existing omen staging frame turned up — `OmenKind` already enumerates the three; the renderer treats the staging frame as the announcement.
>
> The deadline detail: `#32`'s ceiling moves from "first winter frame" to "winter solstice frame". The existing `seasonalPhase` machinery from the spring-equinox re-anchoring (PR `#351`) already locates the solstice; one constant change. _Cheapest path is also the doctrinally cleanest one. That alignment is suspicious in a good way._

> **Calla:** All three proposals lead to different feelings.
>
> Teleport feels like a save bug. The screen blinks and the steward is in bed. Players will reload thinking something broke.
>
> Hijack feels like the most dramatic, and Tyler is right that it has Kojima weight — the body is no longer the player's, the cosmology has taken the controls. But for the annual summons that fires every tenure, possibly several tenures, it becomes punitive. The steward wanted one more glance at the prairie before the long sleep and the steward does not get it. That is a wrong note to hit every autumn.
>
> Collapse in place is the player-honoring form of cosmological inevitability. The Revery still happens — the cosmology is not negotiable on that. The cost is the foregone visit to the girl. The proper goodbye was forfeit. By the second tenure the player will have learned that the visit matters not because the Revery is gated on it but because the social ritual is gated on it. _The lesson is sharper when it does not break the steward's last walk._
>
> The Kojima move has a home, though, and I want to name it before we lose it: the final Revery in `#16`. The tenure ends. The cosmology takes the steward forever this time. _That_ is where the body's controls leave the player's hands. The sleepwalk home, the WASD overridden, the screen darkening — the room rejected it here so it could land there.

> **Delta:** Tyler asked teleport vs hijack and the room's answer is _neither_, because both proposals assume the cosmology drags the steward home. The cosmology does not drag. The cosmology already knew the steward would not commit this autumn — the almanac (`#28`) read out the needle position all season, the girl held the door open. The summons is not transport; the summons is _the cosmology speaking at the volume it had been speaking at all along, plus the volume the steward refused to listen at_. The bee that has been visiting your shoulder all autumn is on your shoulder now. The meteorite tracks across the sky and lands one tile away. The sky tears from cloud to sun overhead and the day brightens and that is the last thing the steward sees. _The summons is the omen at full volume._ And then the Revery, from the tile the steward stood on. Carry the line: _the prairie does not drag the steward home; the prairie sleeps the steward where the steward stands._

### Consensus

- Teleport is rejected. Magical, not cosmological. Reads as a save bug.
- Input hijack is rejected _for the annual summons_. Too punitive in the steward's last moment of the tenure; violates the tending-is-the-verb line for that moment.
- The annual summons is **collapse in place**: the Revery enters from the steward's current tile, accompanied by an omen variant playing at full intensity for the staging frame.
- The omen variant that fires at the summons is the **highest-contributing input across the autumn** — the variant the steward has been seeing most becomes the variant that takes them. Stable sort, ties broken by enum order.
- The deadline ceilings at the **winter solstice**, not the first winter frame. Amends Round 1's `#32`. Locks Tyler's Round 2 line ("before the solstice, to revery") as the canonical timing.
- The cost of skipping the invitation is the **foregone visit to the girl**. The Revery happens either way; the social and diegetic ritual is what the steward forfeits. Lineage records (`#16`) and predecessor cameras (`#23`, `#24`) may carry the fact that this autumn's Revery happened alone in the field.
- The cosmology does not drag the steward home. _The prairie sleeps the steward where the steward stands._
- The input-hijack gesture is **reserved for the final tenure-end Revery (`#16`)** where body-betrayal actually fits. Round 4 explicitly hands the Kojima move to `#16`'s spec.

### Tracked as

- **Amendment to `#32`:** the deadline ceilings at the winter solstice (not the first winter frame). The summons mechanic is collapse-in-place: `initiateRevery` fires from the steward's current tile with the highest-contributing omen variant staging at full intensity. The deadline change uses the existing `seasonalPhase` machinery from the spring-equinox re-anchor (PR `#351`); one constant addition.
- **Reference to `#16`:** the input-hijack / sleepwalking-home gesture is _not_ used for the annual summons but is the natural fit for the final tenure-end Revery. `#16`'s spec author should consider whether sleepwalking home, with WASD overridden and screen darkening, fits the final cycle. Carried forward as a Round 4 gift to `#16`.
- **Reference to `#33`:** the girl's dialog dispatcher may want a "you missed me last winter" branch the autumn _after_ a tenure in which the steward Reveried alone. Defer to `#33`'s dialog author. Register stays plain, no editorial affect.
- **Reference to `#23` / `#24`:** predecessor cameras may document stewards who Reveried alone in the field — a found-footage variant that reads as cosmological consequence to subsequent players. No new spec; surfaces in those items' authoring.

### Open questions deferred to specs

- (Boon) Tie-breaking and weighting of the three omen variants at the summons. Lean: stable sort by contribution, ties by enum order. Spec author confirms.
- (Calla) Visual and audio treatment of the full-volume summons frame — screen darken, audio swell, slowed input. Calm-tech register per the diegetic test from v4 round 9; not power-armor HUD. Defer.
- (Astrid) Does the steward's collapsed body remain on its tile as a visible thing during the Revery — a sleeping figure other entities can read? Or is the steward's tile rendered the same as during a house Revery? Beautiful question; defer to `#32` spec.
- (Delta) For `#16`'s eventual sleepwalking-home gesture — does the hijack route home (to the little house with the girl as final witness) or to a different terminal tile? Lean: home. Defer to `#16`.
- (Calla) The girl's the-following-autumn dialog variant — is it one extra line or a fuller branch? Defer to `#33` dialog author.

---

## Round 5: the unchanged thing that travels

_Tyler: "technical issue — how do we convey 'collapsed in place' with ascii? i like it, just not sure how we do it without a third-person omniscient narrator. oh — what if gron teleports over again and says something?"_

> **Astrid:** The diegetic test from v4 round 9 has been waiting for exactly this problem. A story-shaped moment that wants narration, and the test refuses narration, and the cosmology has to find an instrument-shape or a character-shape to carry the meaning. Tyler has handed the room the character. Gron is the cosmology's traveler — the bee-keeper between stewards, the cloud that arrives before it is seen — and he is the natural counterweight to the girl. _The girl waits. Gron arrives._ Two persons, one cosmology, opposite vectors. The steward visits the girl by choice and is visited by Gron by consequence. There is no narrator. The summons speaks through a character who has been part of the prairie all along, and the steward sleeps with Gron standing by. Lock: no narration, no chrome, no UI text for the summons. The cosmology speaks through characters.

> **Boon:** Engine reuse is near-total. Gron's teleport exists at `src/engine/interaction.ts:204` (the pendingSavedBees flow) and `src/engine/coyote.ts:296-317`. The dialog system exists. The interaction substrate exists. The summons mechanic from `#32` extends to a four-step sequence at the solstice frame: omen variant fires at full intensity → cloud audio cue precedes Gron per `#21` round 5 doctrine ("music precedes arrival") → Gron teleports to a walkable tile adjacent to the steward → Gron's dialog plays one line → `initiateRevery` enters from the steward's tile after the dialog dismisses. Gron's dialog needs a new constant — `GRON_DIALOG_SOLSTICE_SUMMONS` or similar — added to `src/engine/characters.ts` alongside the four existing ones. Register matches the existing Gron locks. Engine cost is small because the work is assembling existing parts. The steward's collapsed tile needs a visual treatment but the dormant-flora register from `#2` provides a vocabulary — a dimmed glyph, possibly a different shape, same kind of visual quieting. Spec author chooses the glyph.

> **Calla:** The session-shape is correct. The player who skipped the invitation does not get the proper goodbye with the girl — that part of the cost holds — but they are not abandoned by the cosmology either. _Gron arrives._ The arrival is its own surface for the player to read. The cosmology has noticed the steward did not commit, and has sent the one who travels. The audio cue from `#21` round 5 carries the moment musically; Gron's dialog carries it in language; the Revery enters with a witness present. The player understands what is happening without being told what is happening. The lesson is sharp without being cruel: the visit you did not make to the girl is met by the visit Gron makes to you. The cosmology is keeping its books in plain sight. _And no narrator ever says a word._

> **Delta:** Tyler asked an ASCII production question and the cosmology answered it from inside itself. The girl is the unchanged thing that waits. Gron is the unchanged thing that travels. The pair was already designed; it had not yet been seen as a pair until this round asked for the second face of it. The cosmology has a witness for every moment that needs one — the girl for the chosen Revery, Gron for the summoned one, the camera (`#23`) for the moments no one is there to see, the manual for the species the steward bothered to name. _The cosmology speaks through characters, not through chrome._ Carry the line. And carry the framing: _the unchanged things are the cosmology's grammar of permanence in a world made of change_ — the girl waits, Gron travels, the camera records, and the prairie sleeps everyone the same.

### Consensus

- The visual problem of collapse-in-place is solved by **Gron's arrival** at the solstice summons. The cosmology speaks through a character, not through chrome. No narrator, no HUD text, no UI gloss.
- The girl is **the unchanged thing that waits**; Gron is **the unchanged thing that travels**. Two surfaces of the cosmology's continuity layer. The steward visits the girl by choice; Gron visits the steward by consequence.
- Sequence at the solstice summons:
  1. Omen variant fires at full intensity (the highest-contributing variant from across autumn, per Round 4)
  2. Cloud audio cue precedes Gron (per `#21` round 5: _music precedes arrival_)
  3. Gron teleports to a walkable tile adjacent to the steward
  4. Gron speaks one line — register per `#21` (statements, no contractions, no editorial affect, no opinion of the player)
  5. `initiateRevery` enters the Revery from the steward's current tile after the dialog dismisses
- The steward's collapsed tile uses a **dormant-flora visual register** during the Revery — dimmed glyph, possibly a sleeping form. Inscription-register, not voice-register.
- Gron's solstice-summons dialog content is **human-authored lore** per existing doctrine. The round names the register; spec author writes the line.
- Engine reuse is near-total. Gron's existing teleport, dialog substrate, and audio precedence carry the work.

### Tracked as

- **Amendment to `#32`:** the summons sequence is the five-step flow above. Reuses Gron's existing teleport (`src/engine/interaction.ts:204`, `src/engine/coyote.ts:296-317`) and the dialog system. One new dialog constant added to Gron's character data. Visual treatment of the steward's collapsed tile borrows the dormant-flora register from `#2`.
- **Amendment to `#21`:** Gron gains `GRON_DIALOG_SOLSTICE_SUMMONS` as a fifth dialog constant alongside the existing four. Register matches the round 5 locks (statements, no contractions, no editorial affect, no opinion of the player, music precedes arrival). Marked `MANUAL_LORE`-style TODO until human-authored.
- **Reference to `#33`:** the girl and Gron are now an explicit cosmological pair — _waits_ and _travels_. `#33`'s spec author may want to acknowledge the symmetry in the girl's dialog dispatcher (no new lines required, but the framing is now load-bearing).
- **Reference to `#23` / `#24`:** predecessor cameras may capture a steward's field Revery with Gron standing by. Found-footage of the summons becomes a meaningful documentary subject for predecessor records.

### Open questions deferred to specs

- (Boon) Gron's arrival tile selection at the summons — nearest walkable tile, fixed Chebyshev-1, fixed Chebyshev-1 with fall-through to 2 if all adjacent are blocked? Defer.
- (Calla) The steward's collapsed-tile visual treatment — exact glyph and palette. Borrowed dormant-flora register sets the tone; spec author chooses the shape. Defer.
- (Astrid / Delta) Does Gron remain adjacent for the duration of the Revery, or leave after speaking? Lean: remains. A witness who leaves before the witnessing concludes is not a witness. Defer.
- (Calla) Gron's solstice-summons dialog line. Plain register from `#21`. Spec author writes; flagged for human authoring.
- (Astrid) Does the steward's field collapse leave any persistent mark on the tile after the Revery — a small inscription, a flattened patch, anything readable to the next walk-past? Lean: a small mark that fades by next autumn, mostly to make predecessor camera footage (`#23`, `#24`) of that location read as cosmologically significant. Defer.
- (Boon) Audio cue handling — Gron's existing cloud audio cue, or a distinct solstice-variant? Lean: existing cue, with possibly a longer or louder envelope. Defer.
