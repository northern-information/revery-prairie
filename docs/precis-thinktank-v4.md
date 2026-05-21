# Precis thinktank — v4

A continuation of v2/v3. v2 captured rounds 1–6 of the editorial back-and-forth; v3 distilled v2 into locked decisions. v4 picks up after v3 with a new arc of rounds, sparked by a question Tyler brought to the room on 2026-05-19: _what makes this game fun? where does the dopamine loop happen?_

What follows is the rounds. Decisions are stated as decisions. Open questions are flagged. v4 is _additive_ to v3 — it does not invalidate v3 unless a round here explicitly amends it. Items that should propagate to `docs/precis-thinktank-v3.md` are tagged `**Amendment to v3:**`.

## The cast

Carried forward from v2 with no changes:

- **Astrid** — vision purist.
- **Boon** — systems-first.
- **Calla** — player-experience pragmatist.
- **Delta** — late-arriving frame-breaker.

## The naming

> _Heat death is the antagonist._
> _Tending is the verb._
> _The tenure is the unit._
> _The lineage is the medium._
> _The inventory is the character sheet._
>
> — Delta, 2026-05-19 (lines 1–4); round 7, 2026-05-20 (line 5)

This is the cosmology in five lines. v3 carried the components implicitly; v4 names them. Every subsequent design decision in this game can be tested against these five lines. If a proposed mechanic does not serve one of them, it does not belong in this game.

The five lines are the new top of the doctrine. Items already locked in v3 are re-readable through them:

- **Heat death is the antagonist** — entropy is the unifying frame. Seasons, deep time, the Revery, the egregore winter advance, Voynich drift, the failure-state biomes. Every locked v3 mechanism is a face of this one force.
- **Tending is the verb** — not fighting, not building, not acquiring. The player's relationship to the world is _attention_. v3's removal of the action bar (#0) was the first commitment to this. v4's wear system (#15) is the second.
- **The tenure is the unit** — the game has an ending and that ending is not a death. It is a handoff. Item #16 (this doc) introduces this.
- **The lineage is the medium** — multiplayer is the lineage of stewards. Other players are not coop partners and not adversaries. They are _predecessors_ and _successors_. Item #16 begins to wire this; v3's existing multiplayer infrastructure becomes the substrate.
- **The inventory is the character sheet** — all player agency is item-shaped. FromSoft is the touchstone: spells are scrolls, abilities are talismans, the character sheet _is_ the inventory. Revery Prairie was already moving this direction by instinct (no action bar in #0, no event log in #14, wear as the next mechanic in #15); round 7 names the principle. No abilities UI ever. No stats. No skill tree. If a proposed mechanic doesn't have an item, we either find the item or we don't ship the mechanic. Items #23 (time-lapse camera) and #24 (seeded predecessor stewards) are the first specs written under this line.

The doctrine also names, descriptively, two tonal registers the cosmology supports:

- **The melancholy register** is primary. The tone of Dickinson, of patient stewardship, of being honored by how you lose the prairie. Almost all currently-shipped content reads in this register.
- **The cosmic-horror register** is secondary and **opt-in by placement.** Round 8 admits it formally. The substrate that lets it land is the camera (#23) — found footage is the genre of cosmic horror in a materialist universe. A player who plays a calm tenure and does not seek the seam experiences a melancholic prairie. A player who places cameras adjacent to egregoric tiles, who explores ruins seeking predecessor footage, who deliberately investigates — that player experiences the horror. Same world, two readings.

## Open and locked

**Locked in v4:**

- The four-line cosmology naming above.
- Wear as a universal mechanic. Items wear visibly. Soil wears (depletion). NPCs wear (mortality). The prairie wears (egregore advance, locked in v3). The steward wears (Voynich drift, locked in v3). All locked. Spec sequence:
  - `#14 Delete the activity event log` (spec written, in NEXT)
  - `#15 Wear` (the smallest commitment/mastery/loss substrate — round 1 below)
- Wear is **visibly displayed**, not hidden. _It is a game about noticing. You notice your net not working as great anymore._ — Tyler.
- The game has an ending. The ending is a tenure handoff, not a death. The save file does not delete; it becomes a predecessor record the next tenure inherits. Item #16 below.
- Multiplayer is lineage. Adversarial multiplayer is foreclosed by the cosmology. Item #16 wires the first surface of this.
- The activity event log is **deleted with no replacement** (resolved in round 0 of this v4 arc; spec is `#14` in `docs/precis-status.yaml`). No toast, no chime, no ambient ticker. The world communicates by being looked at.

**Locked in round 4:**

- **All plants spread autonomously.** Clover via stolons (Trifolium repens — the creeping clover, the species choice already encoded this). Wildflower via pollinators (gated on #7). Tall grass via rhizomes. Different rules per species; same mechanism layer. Spec is `#17`.
- **Bee+clover becomes the seeding ceremony.** Large radial wave (~7-9 tile radius, ~100-250 tiles per cast after terrain filtering), slow animation, **the bee binds to the patch as its pollinator for the patch's life** — one bee per patch, ever. Bee and clover are **recovered from ruins, not gifted by NPCs.** Folded into `#17`'s scope.
- **Meteorites are not a resource.** They are placeable cosmological punctuation — the player's vocabulary for marking places as having consequence. Place them, connect them with faint golden lines, close shapes into hallowed ground. The unstable-meteorite 1-in-7 explode mechanic (`entities.ts:113`) is deleted in the same spec. Tracked as `#18`.

**Open in v4:**

- Whether visible wear shows a continuous indicator (alpha decay across the item's lifetime) or a single late-threshold marker (a small affordance only when the item is near broken). Tyler said "visible wear" — round 1 below assumes continuous alpha decay as the default, with a documented escape hatch if playtesting argues otherwise.
- What the predecessor record actually contains. Round 2 below sketches a minimum-viable surface; the full design is deferred to #16's spec.
- Whether the player is ever named or referenced by their own steward-name in someone else's manual. Round 2 below has a strong recommendation; not locked.
- The soil depletion mechanic. Named in round 3, not specced. Item TBD.
- NPC mortality, particularly Moab's "the spring he does not emerge." Named in round 3, not specced. Item TBD.
- Patch identity: when two autonomously spreading patches touch, do they merge? Does the original bee adopt the new tiles? Round 4 flagged; defer to #17 spec.
- Stone-circle cosmological consequence: hallowed ground biases the next Revery's egregore spread — toward or away from the circle, and based on what? Defer to #18 spec.
- Perf gate on the flora lifecycle tick: tile count threshold for frame-budget concerns. Boon wants measured before #17 ships.

---

## Round 0: kill the activity event log

_Tyler: "what do you think of the activity log? it's starting to feel almost antithetical to what the game is about."_

> **Calla:** It's a terminal scrollback. Pickup, drop, combine, dialog, discovery, narration. Five of the six are receipts for actions whose world-effects already do the work — pickup blooms, items appearing on tiles, dialog boxes closing, recipe outputs materializing. The sixth, narration, is the only one with thematic legs and is doing 1/8th of the work the log claims to do.

> **Boon:** Five of six are redundant with their own world-effects. Net cost of deletion: ~150 LOC removed, 0 added. The activity log was scaffolding to confirm things were working. They work.

> **Astrid:** And the activity log is structurally a god's-eye transcript. _At time T the player did X._ That is the worldview of a state machine with an input device. It is the exact opposite of _steward, participant, observer, temporary influence._ A steward doesn't read a transcript. They look at the field. The field tells them. The manual (precis-6, shipped) is the diegetic version. The activity log is the anti-Voynich. **One of these belongs in our game. The other is from a different game we are no longer making.**

> **Delta:** Then it dies. Five of six events have world-effects already. The sixth — narration — dies with the rest. The world is not running tail -f. The world is happening, and either the player notices or they don't.

**Consensus:** Delete `EventLog.tsx`, `useEventLog.ts`, the EventLog test, and all eight `addEvent` call sites in `GameScreen.tsx`. No replacement surface. The bottom-bar center slot becomes empty; Minimap stays left, Backpack stays right.

**Spec:** `harness/specs/delete-event-log.yaml` (written 2026-05-19, status: todo, no deps — visible in NEXT).

**Tracked as:** `#14` in `docs/precis-status.yaml`. Starts the new convention — non-precis-numbered backlog items get the next available integer id and become "story numbers" alongside the precis items.

**Calla, late note:** Existing tests that asserted log content (e.g. _expect log to contain Picked up Clover_) should be removed entirely. Do not rewrite them to assert against a replacement surface — there is no replacement.

---

## Round 1: loss, attachment, and the FromSoft loop translated

_Tyler: "where does the dopamine loop happen? we have a bee net that only works so many times... commitment on one side of the coin and loss on the other."_

> **Calla:** Three things are hiding in this question and need to be separated. **Mastery loop** — the player gets better at the game itself. **Commitment loop** — choices that close off other choices, the FromSoft opportunity-cost insight. **Loss loop** — losing things you cared about. Three different mechanics. Three different surfaces. The instinct after "no play progression" is to add XP and skill points. We must not. The vocabulary alone would kill the genre we're inventing.

> **Boon:** Mastery is mostly free. It emerges where systems are legible and require timing. The player who learns to read omen patterns gets more Reveries in winter than the player who doesn't. The game does not announce mastery. The player just gets better outcomes. **We don't need to add anything for mastery; we need to be careful not to add tutorials and tooltips that would erase it.**
>
> Commitment is where the spec lives. **A seed is a singular object.** No stacking, no counter. _The seed Moab gave you._ Plant it once, it's gone. The Torchbearer's burn line — where the player led him is decided, not undoable. Refusing the Torchbearer (locked in v3) is the canonical commitment _and_ the canonical loss.
>
> Loss is precis #4, #8b, #10 — already locked. The blocker is that loss has no weight without attachment, and attachment has no weight without commitment. We've built the loss mechanism before the thing that makes loss hurt. That's not wrong — those are big systems with lead time — but it explains why the game feels inert right now. **We've laid the conditions for grief without the conditions for love.**

> **Astrid:** The FromSoft thing that's portable: _the world is annotated by your history._ Every place you've been is marked by who you were when you were there. That ontology is exactly what we want. What is not portable: the combat loop, the death loop, the recover-your-runes loop. The prairie cannot have a death loop — there is no _you died_ event the cosmology allows. _You don't fail by dying. You fail by not noticing._
>
> So the FromSoft-shaped feeling is available to us. It just has to be translated. "I used to die here" becomes "I used to lose this field every winter." The "perfect parry" becomes "I read the omen this time and got the Revery I needed." The bonfire becomes _the spring Moab walks out of his cave._ The player doesn't go to fire; the player earns the season where Moab appears. **The world's calendar is the difficulty curve.**

> **Delta:** The bee net that only works so many times. Tyler said it casually. It is the precis-correct version of equipment. Things you use until they break, and then they are gone. The prairie has no factories. Everything is hand-made or grown. Wearing-out is the natural ontology. A net you wove from grass holds a certain number of bees and then falls apart. A clay vessel carries water from the pond a certain number of times and cracks. Moab's gift, if it is a tool, will eventually be a memory of a tool. **Permanence is a capitalist assumption.** Items should age. Tools should fail. The player should learn to make new ones, walk back to where the material was. That's a map-of-meaning generator. That's geography earning its keep. **Wear is mastery, commitment, and loss in a single mechanic.**

> **Calla:** Yes. And the loop is _what the wear sends the player to do._ The net is gray today. Where did I find the reeds? The south pond patch. Is that patch still there after the winter? The walk back to check is the gameplay. The action of re-making is the action of re-attending. **In a capitalist game, you stockpile. In ours, you renew.**

> **Boon:** Costing. `ItemInstance` gains optional `wear: number` (0.0 fresh, 1.0 broken). `ItemDefinition` gains optional `maxUses: number`. Renderer alpha scales with wear. One handler per wearing tool — maybe 5–10 tools in the foreseeable future. At wear=1.0, item is removed from inventory. No fanfare. Empty grid cell is the eulogy. Medium-sized spec, 2–3 weeks. **`maxUses` should be high enough that wear is a presence, not a pressure.** Per session, maybe 5–10% of player actions touch a wearing item; the rest are ambient. **We are not making Don't Starve. We are making the prairie honest about impermanence.**

> **Astrid:** And the universalization. Tools wear. The prairie wears. NPCs may wear — Moab the Torchbearer does not have infinite springs left in him. **The player wears** — the Voynich drift in the steward's manual entry, already locked in v3. Wear at the item layer is _the teaching grammar_ for the wear that will happen to the player in the late game. By the late game, the steward's entry is half-Voynich. The mastery loop and the wear loop are the same loop seen from two angles. **What the player gains in skill, the world gains in claim on the player.**

> **Delta:** The bonfire isn't a place you sit by. It's the season Moab walks out of his cave. Builds are wear. Loss is impermanence. Commitment is the singular seed. None of this needs a stat sheet. Spec wear next.

**Consensus:**

- No skill points. No stats. No XP. No builds-as-traditionally-meant. The instinct is right; the vocabulary would kill the genre.
- **Wear is the next mechanic.** Item id `#15`. Spec to be written next.
- **The singular seed is a free upgrade** alongside wear. Gift items from NPCs (Moab, Gron) become one-of-one — no stacking. Wired in the same spec or as a sibling.
- **The "bonfire" is Moab's emergence.** The player doesn't reach the bonfire; the bonfire arrives when the calendar says so. Re-reads Moab's emergent role in v3.
- Visible wear, per Tyler 2026-05-19. Continuous alpha decay across the item's lifetime is the default. Escape hatch if playtesting argues for late-threshold-only.

**Amendment to v3:** the v3 doctrine has #4 as the next pick after #6. v4 adds `#15 Wear` to the queue and does not block on whether it ships before or after #4. _Tyler 2026-05-19: "i'm not sure it matters if it ships before 4. we're in hyperbolic time remember."_ Both #4 and #15 are valid next picks; the room defers sequencing to the implementer.

---

## Round 2: heat death, the tenure, and the lineage

_Tyler: "is the antagonist entropy itself? heat death?"_

> **Astrid:** Yes. And the precis has been pointing at it from page one. Seasons take the bloom. Deep time takes the steward. The Revery takes the year. The egregore winter takes the line. The drift takes the steward's own page. There is no antagonist with a name. There is **a single force, observed from many angles, that the prairie holds against.** That force is entropy. The steward is not a hero. The steward is _a temporary slowing_. That is what stewardship is, ontologically.
>
> And the game's anti-cap angle is structural, not editorial. Capitalism's promise is escape from entropy — infinite growth, permanent acquisition, the stockpile that defeats time. The precis rejects that promise. **The game's politics and the game's physics are the same thing.** The reason we won't add a skill tree is the same reason the prairie won't grow without winter. Permanence is the lie capitalism tells; the prairie tells the truth.

> **Boon:** If entropy is the antagonist, **every system in the game should leak in the same direction.** Right now most of our systems are conservative. The world ticks but does not _decay_. Wear is the first leak. Once we accept entropy as the antagonist, look at every system and ask _where does this leak?_
>
> - Tools — leak via wear. Spec next (#15).
> - Soil — should leak via depletion. Same patch planted three seasons running gets thinner. Rotation, fallow, nitrogen-fixing crosses. _Trifolium repens_ is already a nitrogen fixer in real life — the precis-correct game has encoded this in its species choices; we just haven't built the leak yet.
> - NPCs — should leak via mortality. Moab does not have infinite springs. Astrid named this above. Ghosts already exist — they are NPCs that have passed the leak. We have the output; we need the transition.
> - The prairie itself — leaks via egregore winter advance and the failure-state biomes. Locked in v3.
> - The steward — leaks via Voynich drift. Locked in v3.
> - The save file — _(pause)_ leaks via... what?
>
> Six systems. Two locked. One in progress. **Three are gaps.** That is where the game is currently quietest.

> **Calla:** And the danger in "every system leaks" is that it reads as _every system is a chore_. That is not what we want. The prairie should feel like honesty about time, not a Sisyphean treadmill. The trick is that **entropy the player can fight in ten small ways is the opposite of entropy that overwhelms them.** Our equivalent of weeding and repairing is stewardship as a thousand tiny non-acquisitive verbs. Walk back to the reeds. Re-weave the net. Notice the south patch is thinner. Move next year's planting. Watch Moab walk the line.
>
> When entropy is the antagonist, **the verb that resists it is tending.** Not fighting, not building, not acquiring. Tending. That is a verb capitalism cannot monetize, which is precisely why the game's politics work. **The player wins not by accumulating but by showing up. The player loses not by dying but by not noticing.**

> **Delta:** Then there is one more thing the game should have, and it is the hardest thing to design. **An ending.**
>
> If entropy is the antagonist and the steward is a temporary slowing, then the precis-true game cannot be infinite. It must end. Not because the player loses — there is no losing in our cosmology — but because **stewardship is bounded.** The steward arrives. The steward tends. The steward leaves. Another steward arrives.
>
> Heat death as the antagonist offers this: you cannot win against it, but you can be _honored by how you lost_. The Revery summary, the failure-state biome, the steward's half-Voynich manual entry, the spring Moab does not emerge — these are the shapes of an honorable surrender to entropy. The game ends with **the prairie less alive than when you arrived, but more remembered.** The player's record is the manual they leave behind, which the next steward will find. Genesis is named for this — the precis-true new-game flow is not _start over_ but **inherit.**

> **Astrid:** And note what this does to multiplayer. **The other stewards are other tenures.** They came before. They will come after. The networked layer is not _play with friends_. It is the long lineage of stewards the prairie has known. A ghost in the field might be a former player. A manual entry half-filled when you arrive might be the one the last steward couldn't finish. The drift in the steward's own page — that's the language _the prairie_ has been learning from every steward who came before. **Voynich isn't the prairie's first language. It is the accumulated grammar of stewardship.**
>
> Multiplayer-as-lineage is precis-true. Multiplayer-as-coop is precis-adjacent. Multiplayer-as-PvP is precis-hostile. **Heat death as the antagonist forecloses adversarial multiplayer.** In a game about entropy the other players cannot be the enemy. They can only be other temporary slowings, witnessed from across the lineage.

> **Calla:** When the player understands — late, gradually, never tutorialized — that they are not the protagonist of an infinite game but **a tenure inside a long lineage**, the entire emotional register changes. The net I am weaving will be unfinished when I leave. Someone will find it. **The player loves the prairie because they will lose it.** Not because the game took it from them. Because they will hand it over. That is the structural emotion the precis has been encoding all along.

**Consensus:**

- **Heat death is the antagonist.** Locked. Four-line cosmology adopted as the top of the doctrine.
- **Tending is the verb.** Tools should not exist in the lexicon if they imply ownership; they exist as tended objects.
- **The tenure is the unit.** The game has an ending and the ending is not a death. Tenure handoff. Save file becomes a predecessor record.
- **The lineage is the medium.** Multiplayer is lineage. Adversarial multiplayer is foreclosed.
- New item `#16 The tenure ends — the lineage handoff` (sketch below; full spec deferred). Depends on #4 and #10.
- The three gaps Boon named (soil depletion, NPC mortality, save-file leak / tenure handoff) are tracked. Soil and NPC mortality become candidate future items. The save-file leak is what #16 is.

**Open questions (not locked, deferred to #16's spec):**

- What does a predecessor record actually contain? Minimum-viable surface (Calla's proposal): the previous steward's manual, as the new steward finds it. Some entries complete, some half-filled, some in the egregore register if the predecessor drifted far. _Their_ name visible somewhere — maybe as the author line on the manual's cover page. Maybe as the inscription on a ruin. **One readable name from a previous tenure is more powerful than a hundred procedurally generated ones.**
- Is the player ever named in someone else's manual? Astrid: yes, and the moment matters. _The player opens their manual late in their tenure and finds a section attributed to a steward they have never met, and that steward's name is one they have seen before — on a ruin, on a ghost's last words, in a dialog with Moab who remembers._ The lineage becomes legible by recognition, not by listing.
- What triggers the tenure ending? Calla's proposal: drift threshold. When the steward's own manual page is fully Voynich-registered, the tenure ends. **The player runs out of language at the moment the prairie runs out of them.** Boon: this is the only ending condition that doesn't require a new system — it derives from `state.player.cosmologicalDrift` which the precis already names. Free.

---

## Round 3: the leaks, named but not specced

_Tyler is bringing the next item. The room marks where it would have continued before pausing._

> **Boon:** Two of the three gaps I named are worth tracking even if they don't get specced this session.
>
> **Soil depletion.** Right now the prairie's soil is conservative — a tile that grew clover last year will grow clover this year with no consequence. The precis is explicit about soil being one of the four readable observables (the v3 doctrine puts soil-observation into the naturalist's manual, #6, which shipped). But _readable_ is not _consequential_ yet. **If soil depletes from monoculture and rebounds from rotation/fallow, the player has a new geography-tracking verb that doesn't require any new content.** Same tiles, new dimension. Probably a small spec — 1–2 weeks.
>
> **NPC mortality.** Moab is forty years older by the end of the player's tenure than at the start, on the in-fiction clock. He should be visibly less able to walk the line in late tenure. At some point, he does not emerge. **Ghosts are NPC entropy's output; we lack the transition.** Bigger spec than soil — has to handle the social weight of an NPC death, the dialog tree branches around it, the player's emotional preparation. But within range.

> **Astrid:** And both of these serve the four lines. Soil depletion is _heat death is the antagonist_ rendered in dirt. NPC mortality is _the tenure is the unit_ rendered in the lives that surround the steward's own. Neither is doctrinally controversial. Both have just been waiting for someone to write them down.

> **Calla:** I want to flag one thing about NPC mortality, because it could go wrong. The player should not be able to _prevent_ Moab's death. There is no quest to save him. There is no rare item that extends his life. **The point of NPC mortality is to teach the player that entropy applies to people too.** If the player can game it, the lesson dies. Moab dies because that is what happens. The player's relationship to that death is the gameplay. **What they remember of him after, in his absence, is the manual entry he leaves.**

> **Delta:** And — the deepest version — there should be a tenure where Moab dies before Tyler arrives. The player meets the cave that used to be Moab's. There is a ghost there. The folk name has shifted. The Torchbearer who walks the line that year is not Moab — it is whoever has taken up the drip torch. **The lineage applies to NPCs too. The cosmology has no protected nouns.**

**Consensus:**

- Both gaps are real and worth specifying.
- Neither blocks #14 or #15. They are candidate future items, to be sized and sequenced when the room has more capacity.
- The NPC mortality gap is the more complicated of the two; it touches dialog, the manual, the seasonal calendar, and the lineage system from #16. It probably wants to wait for #16's substrate to land.
- Soil depletion is independent and could ship at any time after #15.

**Tracked as (sketches; not yet on the board):**

- **Soil depletion** — small spec, no deps beyond what is shipped. Could be added to `docs/precis-status.yaml` as soon as the room wants to commit to it.
- **NPC mortality** — medium spec, deps on `#16 The tenure ends`. Should not be added to the board until #16's spec exists.

---

## Round 4: the grind, Dickinson, the ceremony, and the stones

_Tyler: "you start by combining a clover and a bee and make a 3x3 patch of clover. how do we make the next part not a total grind?" Also: "Moab doesn't give you seeds" (correcting earlier round notes), "say more about meteorites because I've been skeptical of them for some time now."_

> **Astrid:** Dickinson is the touchstone. _To make a prairie it takes a clover and a bee, and revery. The revery alone will do, if bees are few._ That poem is the operational law of the world. Two ceremonies of growth — the bee+clover pair, and the Revery itself — and between them, the prairie spreads on its own. _If materials are scarce, imaginative time substitutes for them._ Stewardship-time growth is slow and small. Revery-time growth is the massive jump. The grind dissolves the moment the player understands they are not the engine of growth; they are its attendant.

> **Calla:** Operationally: the bee+clover combine becomes a wave-emission. Large radius (7-9 tiles, ~100-250 tiles per cast depending on terrain), slow and ceremonious, respects water/cave/space boundaries. **Crucially, the bee binds to the patch** — it doesn't return to inventory, it becomes the patch's pollinator for the patch's life. **One bee per patch, ever.** Losing a hive is grief, and the player feels it in the next ceremony attempt — they need another bee, and bees are rare.

> **Boon:** Patch identity becomes a real concept — `patchId` tracking, connected-component logic on flora tiles, genetics propagating through autonomous spread. This is a substrate decision, not just a UX flourish, and it has to be answered in #17's spec. Perf concern: combine of 200 tiles + autonomous spread + ~5000 active flora tiles within two seasons. Lifecycle tick must be measured.

> **Astrid:** And Moab gives no seeds — correction noted. The bee and the clover are _recoveries_, not gifts. They come from ruins (precis-5, shipped). The first ceremony is not a creation. **It is a return.** The player puts their hand to the prairie that was. The opening of the game becomes: walk the dirt, find a ruin, find another, combine them where you stand, watch the wave go out. The walking is the gameplay during this period. The barrenness teaches the player to notice.

> **Delta:** Meteorites. They started as a universal resource — ore, minerals. They are no longer that. They are the visible carrier of veil-thinning, and they are the player's vocabulary for marking places as having consequence. Place one — nothing visible. Place two — a faint golden line connects them. Three — a triangle. Four or more in a circle — **hallowed ground.** Golden rays. The ground inside acquires a quality the rest of the prairie does not. Things grow differently. Maybe better. Maybe stranger. Maybe both. The player has performed a small architecture of attention, and the cosmology reads it.

> **Astrid:** This gives us the complementary ceremony to bee+clover. **Bee+clover is the player's commitment to the prairie's native life. Stone circles are the player's commitment to the prairie's otherness.** Two hands of stewardship. What you would protect, what you would invite. The third and fourth layers of the help-the-egregores schema from v2 round 5 (meteorite-carrying, late-game ritual) become stone-circle architecture and what-happens-at-the-center-on-the-right-day.

> **Calla:** The stone circle gives the player the first verb in the game that creates a permanent geographic landmark. Tiles are impermanent. Entities are mobile. A placed meteorite is the first object whose **location is its meaning**. The player walks past the south meadow next spring and there is a stone. They placed it. The stone remembers them. The triangle is the first geometry. **The player has drawn a shape onto the prairie that did not exist before they did.** Authorship without building, because the meteorites are not theirs — the arrangement is.

> **Boon:** Costing the meteorite system: new state (`state.placedMeteorites`), new render pass for the faint golden lines and hallowed-ground hue shift, new interaction (`placeMeteorite`). Connected-component detection for closed shapes. Cosmology hook for biasing the next Revery's egregore spread by hallowed-ground placement. Medium spec, standalone, ~2 weeks. Standalone — doesn't block anything. Becomes #18.
>
> **Flag for the record:** the unstable-meteorite mechanic (1-in-7 chance to explode on pickup, `entities.ts:113`) is precis-hostile and should be deleted in the same spec. A slot-machine penalty in a game about attention is the wrong cosmology. **The destructive register should live in placement, not in pickup.** If a meteorite is going to be the player's vocabulary for cosmological architecture, the act of acquiring one cannot be a coin flip.

> **Delta:** Place a stone. Walk to the next. Place another. Watch the line emerge. Close the shape. The prairie was barren. You did not plant it. You set its punctuation. Then bee+clover, once, at the center. Then walk away. The prairie grows. That is the first season.

**Consensus:**

- **All plants spread autonomously.** Confirmed by Tyler. Clover via stolons, wildflower via pollinators (so the wildflower spread is gated on #7), tall grass via rhizomes. Different rules per species; same mechanism layer. Tracked as `#17`.
- **Bee+clover becomes ceremonial.** Wave-emission, ~7-9 tile radius, slow animation, bee binds to patch. Bee and clover are recovered from ruins (no NPC gifts). Folded into `#17`'s scope as the seeding ceremony — both the spread substrate _and_ the rewritten combine ship together. (Splittable if the spec author wants two specs.)
- **Meteorites become stone circles / hallowed ground.** Place-able, connectable, closed-shape detection, render pass for golden lines and hallowed-ground treatment. Cosmology hook for biasing egregore spread. The unstable-meteorite explode mechanic is deleted in the same spec. Tracked as `#18`.

**Amendment to v3:** v3 framed meteorites as "the visible carrier" of veil-thinning. v4 keeps that framing _and_ adds the stone-circle architecture as the player's vocabulary for cosmological intent. v3 also locked the help-the-egregores schema's third layer as "meteorite-carrying." v4 amends to: **stone-circle architecture is what meteorite-carrying _is_.** The fourth layer (late-game ritual) happens at the center of a completed circle. The schema's mechanics are now named, not just sketched.

**Correction to earlier v4 rounds:** previous rounds spoke of "Moab's seed" or "Moab's gift." Moab has no `gift` field in `src/engine/characters.ts`. The framing should be: **the bee and the clover are recovered from ruins, not gifted by NPCs.** Where a future spec mentions "the singular seed Moab gave you" (e.g. #15's notes), the language must be revised to "the singular bee/clover the player recovered from the first ruin." Wear (#15) and lineage (#16) should be updated when their specs are written.

**Open questions deferred to the spec authors:**

- What is the autonomous spread rate per species? Playtest-tunable. Astrid: trait-bag-influenced (#3 shipped), so spread inherits genetic identity — a south-edge clover is genetically descended from the seed-bee patch's center, visible in the manual hex grid.
- Patch identity and merging: when two patches' spread fronts touch, do they merge? Does the original bee adopt the new tiles? Spec answer required before #17 ships.
- Stone-circle cosmological consequence: hallowed ground biases the next Revery's egregore spread — toward or away from the circle, and based on what? Defer to #18's spec.
- Perf gate on flora lifecycle: at what tile count does the per-tick cost become a frame-budget problem? Boon wants this measured before #17 ships.

---

## Round 5: Gron — the figure with no category

_Tyler: "i want to note that gron is more than a beekeeper. we'll never fully know as a player character. maybe he's a manifestation of the prairie. maybe he's an android. maybe he's an egregoric zombie. but he has many powers and rain and bees are just one of them. he's unimaginably old. he's not kind, exactly, but he is pragmatic. maybe he helps every steward, like gherman in bloodborne? maybe he has enemies. maybe him and moab are old war buddies. who knows."_

_(And earlier in the round: "gron teleports over and lets more bees out. there is NOT one bee per patch. bees work together to make hives.")_

### The bees-plural correction

> **Calla:** I overconstrained the previous round. Bees are not the bonded singular partner of a patch. They are a colony that scales with the patch. The substrate is already in `src/engine/clover.ts:42-43` — `CloverPatch` has `hiveCount` and `maxHives` scaled by tile count via `CLOVER_HIVE_RATIO`. The bee+clover ceremony rewrites the *casting verb*; the patch/hive/bee economy that already exists does the rest. Bees recruit themselves.

> **Astrid:** And Gron is the bee-keeper between stewards. The code has been waiting for us to name this. `interaction.ts:204-205` — Gron releases `pendingSavedBees` when his sealed dialog closes. `interaction.ts:515-537` — Gron teleports adjacent to the player at sealing. The system is partially built. Gron has been collecting bees through the long dormancy while the prairie waited for its next steward. The first bee from the ruin is _one bee_; Gron has the rest, in his cloud, sheltered. He releases them when the moment is right.

> **Delta:** Gron does not give. Gron _releases_. The bees were always free — they were just under his weather. He is not the source. He is the witness who happened to be holding them when you arrived. **The bees the next steward inherits are the bees this steward kept alive.** Gron's cloud is the inter-tenure persistence layer, made of weather and bees. What you hand forward to #16's lineage is, in part, the bees you kept.

### The unknowability question

> **Tyler asks: who is Gron really? "maybe he's a manifestation of the prairie. maybe he's an android. maybe he's an egregoric zombie..."**

> **Astrid:** Then we have to be careful. **Gron is not knowable.** Not to the player, and not fully to us, the designers. That is not a cop-out. It is a structural requirement of the cosmology. The precis-true game cannot have an authoritative explanation of Gron because **a deity who can be explained is a quest-giver**, and we are not making that game. The moment we ratify any answer, the game loses something it cannot get back. Tyler's list of readings is **all simultaneously textually supported, none confirmed**. FromSoft does this with Patches. The Gehrman comparison Tyler raised is exactly right and slightly different — Gehrman is the figure at the threshold of the dream; Gron is the figure at the threshold of the prairie. **Every steward meets Gron. Gron remembers none of them, or remembers all of them, or is the same age he was when the first steward arrived ten tenures ago. We will never say which.**

> **Delta:** Then Gron is the only NPC in the game who does not belong to any system. Flora belong to species. Bees belong to colonies. Coyote belongs to the wildlife register. Moab belongs to the burn cycle. The egregores belong to the Far Garden. **Gron belongs to none of them.** He carries weather but is not weather. He keeps bees but is not a beekeeper. He teleports but is not magic. He is old but not ancient by any clock the prairie measures. He is at right angles to every layer. The cosmology has many categories and Gron is in _none_ of them.

> **Astrid:** And note what this does for the four-line doctrine. _Heat death is the antagonist. Tending is the verb. The tenure is the unit. The lineage is the medium._ **Gron is the figure who is older than the lineage itself.** If the tenure is the unit, Gron is outside the unit. If the lineage is the medium, Gron precedes the medium. He is not a steward; he is not a former steward; he is what was here before there were stewards, and what will be here after. **He is the prairie's relationship to deep time, rendered as a person with rain and bees and a face the player can talk to.** He is the deep-time NPC. The Revery (#4) is the deep-time mechanic. Both are the prairie's way of having a relationship with time that the steward cannot.

### Six locked design principles

1. **Irreducibility.** No origin story. No canonical explanation. Multiple equally valid readings, none confirmed. Contradictory clues, never resolved. If a future spec author wants to write Gron lore, the answer is no. _The prairie does not know. Neither does the game._
2. **No taxonomic home.** Gron belongs to no system. The player tries to fit him into a category and the category breaks. The accumulation of categorical failures is the texture.
3. **No opinion of the player.** Pragmatic, not kind. **No `gronAffection` / `gronTrust` / `gronReputation` field on `GameState`.** No hidden counter. If Gron's later visits depend on player behavior, that dependency must be expressed through **state the player can already see** — patches established, bees alive, tiles tended — with **multiple overlapping and contradictory triggers** so the player cannot back-derive the rule.
4. **Oblique dialog.** Short lines that can be read multiple ways. Statements, not questions or commands. No editorial words. No direct address by title. No contractions — Gron's speech predates American English casual. Indefinite articles where possible (_a steward_, not _the steward_, because the lineage is plural).
5. **Music precedes arrival.** His theme bleeds into the ambient before he appears. The player's head turns. _Then_ Gron is there. **The cloud is heard before it is seen.**
6. **The manual entry says the manual does not know.** Most-glitched entry in the manual. Half-Voynich. The naturalist's authoritative reference *fails* on Gron, which is the single strongest signal we can send that he is not classifiable. Implementation requires a `glitched: true` flag on lore entries + extending `ManualPanel.tsx:218` to route to the `EgregoreLore` renderer when set.

### The dialog audit

Current Gron text (`src/engine/characters.ts:98-110`):

**`GRON_DIALOG_AWAITING_COYOTE`** (5 lines): `...`, `Oh, you must be the new steward.`, `Coyote hasn't returned from the ruins in some time...`, `Worrisome.`, `What is a steward without their coyote?`

- "_new_" implies a series — too much information at first contact. Cut.
- "_Oh,_" implies surprise — Gron was already aware. Cut.
- "_Worrisome_" is editorial affect. Cut.
- The rhetorical question is a *prompt*; Gron doesn't prompt.

**Proposed (3 lines):** `...` / `Ah. A steward.` / `Your coyote is still in the ruin.`

**`GRON_DIALOG_GATHERING`** (1 line): `It takes one clover and one bee.`

- This is the Dickinson poem misquoted. Poem: _a clover and a bee_ — indefinite article. _One_ is recipe-tutorial register. Quoting the poem is the strongest possible move; quoting it wrong is the weakest.

**Proposed:** `It takes a clover, and a bee.`

**`GRON_DIALOG_COMBINING`** (1 line): `Well what are you waiting for, steward? One clover and one bee.`

- _Well what are you waiting for_ is impatience — an emotional stake. _Steward_ as direct address is performative. Cut the line entirely.

**Proposed:** `...` (just an ellipsis — Gron's silences are also speech). Fallback if engine requires non-empty: `A clover. A bee.`

**`GRON_DIALOG_SEALED`** (2 lines): `Ahhh, yes. You are indeed the steward.`, `Here, I've been saving these.`

- _indeed_ implies a privately-held hypothesis confirmed; too readable. _the_ steward implies singular destiny; the lineage is plural. _Here,_ is a hand outstretched, which is affect. Contractions are wrong-century for Gron.

**Proposed:** `Ahhh. Yes. You are a steward.` / `I have been saving these.`

**Total lines: 9 → 6.** Cutting is part of the rewrite. Gron speaks rarely.

### The manual entry — phase 2 (half-Voynich)

Current (`src/engine/manual.ts:81-83`):

> `lore: 'A rain curse follows this immortal codger around rendering his coarse cloak both damp and smelly.'`

Violations: declares him immortal (canonical fact, blown), gives sensory affection (cloak details), classifies him (_codger_), explains the rain (_curse_), and frames everything in classifying register. The authoritative reference is editorializing about an unknowable figure.

**Proposed treatment:** half-Voynich rendering via a `glitched: true` flag. Most of the text in the Voynich font (real EVA tokens from the v3-locked allowlist — confirm location before authoring), with two Latin pierce sentences readable:

- _The page resists._
- _He has been observed near the center._

The Voynich strings carry the rest. The player opens the entry; most of it is the script they have only seen on egregoric flora before; two short sentences in normal type. **The page is failing in front of them.** Implementation: minor renderer extension in `ManualPanel.tsx:218` (~15 LOC), plus the lore entry itself.

### Selection: Gron stops being commandable

`src/engine/selection.ts:9` — `const CONTROLLABLE_IDS = new Set(['coyote', 'gron'])`. **Drop `'gron'`.** Two-line change with no downstream impact — control verbs (right-click-to-move, drag-box-select) gate on `isControllableUnit`, which derives from the set. Once Gron is out, every commanding affordance against him disappears. His scripted teleport (`interaction.ts:515-537`) is unaffected; it's triggered by `mainQuestPhase`, not player input.

**Calla:** The moment a player drags a selection box across Gron and watches him walk where they clicked, the entire cosmology collapses into "Gron is an RTS unit." It is the most damaging single fact about Gron currently in the game.

### Flagged for round 6 (not in scope here)

`coyote.ts:296-317` — when the coyote's pack fills up, the coyote walks to Gron and drops items near him. Gron is being used as a dump-target for inventory overflow. Mechanistically convenient. Cosmologically suspicious. _Why does the coyote bring things to Gron?_ The precis-true answer requires thought; defer; do not change in this round.

**Consensus:**

- **Six design principles locked.** They apply to any spec that ever touches Gron.
- **Bundled spec is `#21 Gron — round-5 doctrine pass`** (controllable removal + dialog rewrites + manual entry phase 2 + bees-plural correction to #17's framing).
- **Open question deferred to spec:** what triggers Gron's later visits beyond sealing? Astrid: "tending-as-witnessed" — soft threshold of player presence in patches over time, not a hard event trigger. Boon: deliberately fuzzy so the player can't game it. Both agree: not a notification, not a counter — the player should not know Gron is coming until he arrives.
- **Coyote-overflow-to-Gron** flagged for a future round, not this one.

**Amendment to #17:** strike "one bee per patch, ever" from the framing. Bees are a colony; the existing `CloverPatch.hiveCount` / `maxHives` substrate does the work; #17's ceremony rewrite only needs to start the patch — the bee economy already exists. This amendment is captured in #17's notes via #21.

**Amendment to v3:** the v3 doctrine treated Gron as the rain/cloud NPC with no further framing. v4 round 5 elevates him to **the deep-time NPC** — same cosmological tier as the Revery (#4), differently rendered. Future specs that touch Gron must cite this round.

---

## Round 7: the FromSoft materialism unlock, the camera, the predecessor floor

_Tyler: "the unlock of having Moab burn reminded me of how FromSoft games are ultimately materialistic. there is an item for everything: even spells. you don't learn a spell or equip it. a learned scholar examines a spell that you found and teaches it to you. all the 'build' choices map back to items. so, porting this elegance over to Revery Prairie, i was thinking about the problem of observing. this is not some beautiful HD game where it would actually be pleasurable to watch a high-def clover. it is ASCII. this is a tension. how to solve? well. what if we introduce 'time lapse cameras' that the player places? and then we can have time-lapse sequences of a plant growing rendered in ASCII?"_

_(And, after the room's first pass: "this also opens up finding film in ruins, or seeding the prairie with previous NPC stewards (until we get MMO baked). film should not be able to be overwritten. it is literally film. it is analog. not digital." The visual register was already shipped — the gel-band scan result (`src/components/GelBandView.tsx`) frames the 8x8 hex grid as a 35mm contact sheet with edge printing `NORTHERN-INFORMATION · 74589084 · N-INFO 400` and reticle crop corners. The genre revealed itself in the artifact before the doctrine named it.)_

### The fifth line

> **Boon:** Revery Prairie has been moving toward FromSoft's materialism by instinct. Deleting the action bar in #0. Deleting the event log in #14. Locking wear as the next mechanic in #15. We never had the principle written down. **The fifth line: the inventory is the character sheet.** All player agency is item-shaped. The implication is structural — no abstract progression layer, no abilities UI ever, no stats screen. The inventory grid plus the manual plus (after #23) the camera archive _are_ the player's interface to who they have become. _If a proposed mechanic doesn't have an item, we either find the item or we don't ship the mechanic._

### The observation tension

> **Calla:** This is an ASCII game about noticing, and ASCII can't deliver the noticing payoff an HD plant can. We've been writing doctrine about attention as if attention itself is the reward. It isn't always. **Attention has to be paid back.** The cosmology says _notice or lose._ The medium says _there is not always something to notice in the instant._ Those are not the same statement.

> **Delta:** The problem isn't observation — the player has a manual, a sidebar, hold-to-scan. The problem is _temporal._ The player cannot observe the prairie at a rate slower than their own attention span. Forty minutes is too long to watch one patch. Forty seconds of compressed footage is not. **The camera is a compression of time, rendered as ASCII.** It is the steward's relationship to time made into an item. The Revery is the prairie's compression of time imposed on the steward. The camera is the steward's compression of time imposed on a tile. **Mirror objects.**

### The camera

> **Calla:** Concrete shape: recovered from a ruin, never gifted. Singular per find. Wears via #15. Records a tile + 8-neighborhood across a chosen span (season, year, Revery). Sparse frame storage — frames only on tile mutation (stage advances, entity arrivals, terrain mutations). Playback is a modal ASCII overlay that reuses the engine's tile pass. **No event annotations.** The footage shows tiles and stages. The player reads it. If a bee landed in frame 47, the bee is in frame 47. There is no caption. The manual taught the player what a bee is. _The camera shows; the manual explains._ Two surfaces, two registers.

> **Boon:** State model: `TimeLapseCamera { id, tile, recording, archive, filmRemaining, wear, predecessor }`. Frames are sparse, event-driven — recording subscribes to the same tile-mutation events the renderer cache already uses. No per-tick overhead. Storage: ~50 frames × 8 neighbors × small state = <5KB per recording in JSON. A dozen full archives is <60KB. Negligible.

### The film

> **Calla:** Per Tyler's lock — **film cannot be overwritten. Exposed is exposed.** That means film is a separate inventory item from the camera. Found in ruins. Loaded into the camera via the existing recipe system. _N-INFO 400_ on the tube label. The camera is 2x2; the film tube is 1x1 or 2x1. **You can find a working camera with no film. You can find rolls of film in ruins long before you find a camera.** The player walks the prairie with a sealed roll in their inventory for three seasons, looking for the second ruin. The film count is the wear surface. When film is exhausted, the camera is decoration — an empty body on a tile, a memory of a tool. **The eulogy is the empty cell.**

### The visual genre

> **Astrid:** The visual language was already shipped before the doctrine named it. The gel-band scan result (`src/components/GelBandView.tsx`, lines 52–117) — 8x8 hex grid rendered as wet-lab gel-electrophoresis with edge printing _NORTHERN-INFORMATION · 74589084 · N-INFO 400_, reticle crop corners, dim-yellow palette pulled from `bg-bee`, monospace font, jittered band widths via `cellNoise()` so the printout reads as analog and not digital. **The camera inherits this entirely.** Playback overlay reads as a developed contact sheet from the same lab. Zero new visual vocabulary. The genre, when named, is **retro-futuristic materialist** — wet-lab artifacts, Voynich manuscripts, 35mm film, contact sheets, gel printouts, edge codes, reticle marks. The game's surface is the surface of a 1970s field-research lab that has been kept running by a steward who is also, somehow, the only one left who knows how. _The genre is downstream of the doctrine_, not chosen.

> **Astrid (cont.):** Footage should not render perfectly clean. A new render pass under `src/engine/render/passes/` adds dim per-frame jitter — the film grain. Same hash function (`cellNoise()`) lifted from `GelBandView.tsx` and generalized. **Old predecessor footage degrades more than fresh footage.** Heat death applies to memory. The materialism is consistent.

> **Boon:** Flag for after #23 ships: extract `cellNoise()` to `src/engine/render/jitter.ts`. The same primitive will drive gel-band jitter, Voynich character offsets, film grain, and anything else the cosmology asks to be analog-imperfect. **One function carries the visual signature of the entire game.** Don't bundle into #23 — it's a follow-up refactor that will be obvious once the camera is on the board.

### The predecessor floor

> **Delta:** The game cannot wait for multiplayer infrastructure to deliver the lineage payoff. **The lineage is the medium** is locked doctrine, but we haven't shipped #16 yet and won't ship MMO for some time. Tyler's seeding instinct is the answer: **the prairie ships with seeded predecessor stewards.** Procedural names, procedurally generated cameras already placed at procedurally chosen tiles, with procedurally generated footage of plants that grew there before. Some cameras have film remaining (gifts). Some don't (memorials). Some footage shows species long gone, geographies that have shifted. _The lineage was always here. The player is not the first._

> **Delta (cont.):** When real predecessor data starts flowing from real previous players (MMO baked), the seeded ones don't disappear. **The seeded stewards become the prairie's oldest layer; the real ones become its recent layer.** The player will never know which were people and which were procedural — and the cosmology says _that is exactly right._ A lineage doesn't distinguish; it accumulates. **Procedural predecessors are not a placeholder for multiplayer. They are the substrate multiplayer rides on.** Without the procedural floor, the lineage feels thin — only as deep as the live player population. With it, the lineage is bottomless.

> **Calla:** And the first-encounter timing matters. Three options were on the table — predecessor cameras placed at genesis, predecessor cameras appearing only in late-tenure ruins, or a hybrid. Lock: **genesis-coincident.** The first time the player ever looks at the prairie, there is a camera by the south pond they did not place. Hours later they find their own camera in a ruin. They load film into it. They start to record. _Then they remember the camera by the south pond._ They walk back. They view its footage. **A clover patch in summer that no longer exists where it stood.** The lineage was always here; they just had to learn how to read it.

### Cascades

- **#16 (the tenure ends).** Round 2's open question — _what does a predecessor record contain?_ — gains a second answer alongside Calla's "previous steward's manual." Add: **the previous steward's cameras, with their footage intact.** Lineage handoff inherits cameras as first-class predecessor evidence.
- **#17 (autonomous spread).** The camera is the primary reading instrument for autonomous spread. _Place a camera at the southern edge of a clover patch. Record a season. Come back. Watch the stolons creep across three new tiles, the hive count rise, the genetic identity propagate._ The camera makes #17's payoff legible. Strong argument to spec #15 → #17 → #23 as a triplet.
- **#19 (soil depletion).** Same shape. Camera a patch you've planted three seasons running. Watch the tile's color drift. The footage shows the leak.
- **#20 (NPC mortality).** A camera left on Moab's cave by a previous steward, with footage of him walking the line in a tenure long past. Defer to #20's spec whether to use this; flag it as available.

### Consensus

- **Doctrine v4 amended to five lines.** Fifth line: _the inventory is the character sheet._
- **`#23 Time-lapse camera (analog 35mm field instrument)`** — size M, depends on `#15`. Film is a separate inventory item, cannot be overwritten. Visual inherits from the gel-band. Film grain in playback.
- **`#24 Seeded predecessor stewards`** — size M, depends on `#23`. Genesis-coincident. Procedural cameras and footage. Substrate for future multiplayer layering.
- **Genre named (descriptively, not prescriptively):** retro-futuristic materialist. Future visual decisions can check themselves against the existing artifacts — the gel, the Voynich pages, the genesis sequence, the manual.

### Open questions deferred to #23 spec

- How many cameras exist per tenure? (Lean: rare — one or two per run. Spec decides.)
- Span options. (Lean: season + Revery as the two MVP choices. Year is a stretch.)
- Inventory grid size. (Lean: 2x2 camera, 1x1 or 2x1 film tube.)
- Whether the player can deliberately gift a camera to a successor versus dropping it accidentally. (Astrid: the state at handoff tells the story — _camera with film remaining is a gift; camera with no film is a memorial._ Don't add UI for the distinction; let state do the storytelling.)

### Open question deferred to #24 spec

- Procedural footage generation strategy: do we simulate compressed lifecycles forward and record the result, or author short authored "scenes" with procedural slot-fills? Lean: the former, because the cosmology's substrate is procedural identity and trait propagation — the seeded predecessors should _have actually grown those plants_ in a compressed simulation, not have their footage authored.

### Amendment to #15 (wear)

The camera is a wearing tool. But the camera's wear is _film count remaining_, not a separate `wear: 0..1` field — film is consumed per recording, not per tick of use. **The wear substrate from #15 may need an `Item-defines-wear-semantics` extension point** rather than a uniform alpha-decay-per-use rule. Flag for #15's spec: not every wearing tool wears the same way. The camera is the first counter-example. There will be others.

---

## Round 8: the cosmic-horror register, found footage, the egregore as appetite

_Tyler: "this is all great. so now we open up cosmic horror in new ways. found footage. backrooms. blair witch. egregoric flora/fauna devouring terran."_

### The two registers

> **Calla:** We have been building the prairie under one register — _heat death is the antagonist, tending is the verb_ — and that register has a tone. **Melancholic. Patient. Mournful.** It is the tone of Dickinson, of Mary Oliver, of someone alone in a field at golden hour. _The prairie is being lost slowly and the steward is honored by how they lose it._ What Tyler is naming now is a second register the cosmology can support: **cosmic horror.** Not as a replacement. As an alternation. The melancholic prairie and the cosmic-horror prairie are not two games. They are two readings of the same world, and which reading dominates depends on what the player encounters and when.

> **Astrid:** _The cosmology has always had cosmic horror in it._ The egregores are not melancholy. They are _wrong_. Voynich is not Dickinson. It is a script no one has been able to decipher in six hundred years. The first Revery's egregoric bump (#8b) is not a sad event; it is an event the cosmology cannot make peace with. **The horror has been latent. The melancholy has been louder.** What Tyler is naming is the moment we stop muting the horror. And the cosmology supports this without strain. _Heat death is the antagonist_ — heat death is not exclusively melancholic. _Solaris_ frames it as madness. _Annihilation_ frames it as transformation that is indistinguishable from being eaten. **The prairie can do both.** The camera lets it do both.

### Found footage as the genre's required object

> **Calla:** Found footage is the genre of cosmic horror in a materialist universe. Blair Witch's tapes. _House of Leaves_'s film. The backrooms. The Stalker zone. SCP. These all share one structural fact — _the horror is what was caught on film by someone who is no longer here to explain it._ Without a recording medium, cosmic horror cannot exist; it has nothing to leave behind. **The camera (#23) is the genre's required object.** Without the camera, the horror has no surface. With it, the horror has its only surface — the prairie does not narrate horror; the camera shows it.

> **Astrid:** What is genuinely new in round 8 — **the egregoric register acquires found-footage as its expressive medium.** A predecessor camera with footage of egregoric flora doing what egregoric flora does — not narrated by the manual, not interpreted by the steward, just _filmed_ — is the first artifact in the game that can communicate horror without editorial. The manual mediates. The Voynich pages mediate. **The camera does not mediate.** It just shows what it saw. That is what found-footage is for, and it is why Blair Witch is more frightening than its plot would suggest. _The medium of unmediated footage is itself the horror._

### The egregore's fourth register

> **Delta:** We have been treating the camera as _the player's instrument._ It is also, structurally, **the egregore's instrument.** The egregores cannot speak. The cosmology forbids it. They have a glyphic register (Voynich), a mechanical register (spread, allelopathy, no-compatible-regions), a visual register (the violet glyph). They cannot have a _narrative_ register, because narrative would humanize them. **But found footage of egregoric flora is not narrative.** It is observation. The footage doesn't say what the egregore _is_; it shows what the egregore _does_, and what the egregore does is, when filmed across a long enough span, deeply wrong. Stage transitions that don't follow lifecycle rules. Tile mutations that propagate against terrain. A bee approaching the egregoric tile and then — the next frame — not. The camera shows the absence and the player has to interpret what filled the gap between frames. **The egregores get a fourth register: the unspoken seen.**

### The egregore as appetite

> **Boon:** Tyler said _devouring terran._ That implies a small change to egregoric spread logic — `#8b` shipped with spread targeting only empty tiles. The new rule: when an egregoric tile spreads under the existing throttle rules and the candidate tile is occupied by native flora, the native flora is _consumed_, not displaced. The replaced tile becomes egregoric at its destination stage. If a camera was filming, the substitution is recorded. If no camera was filming, it happened silently and the player will not know unless they walk past and notice. **The prairie is being eaten and the player has finite cameras.** That sentence is the cosmic-horror loop in one line. _Since `#8b` is already shipped, this rule is tracked as its own follow-up item — `#26` — rather than reopening shipped scope. `#26` depends on `#23` because the metabolism's cosmic-horror payoff only lands once the camera can record it._

> **Delta:** _Terran_ is the cosmology's word for _what belongs to this prairie as it is._ The egregores are _of-but-not-of_ this place. Devouring terran means the egregore is not merely spreading; it is metabolizing the local. The bee that was, the clover that was, the cave wall that was — passed through the egregore's lifecycle and emerged as something else. **The egregore is not invasive (the lint guard catches that word, correctly). The egregore is metabolic.** Different word, different cosmology, both forbidden as player-facing prose but speakable in the room. Round 8 names: **the egregore is the prairie's heat death rendered as appetite.**

### Egregoric fauna

> **Boon:** The cosmology has bees, ghosts, angels, coyote, shooting stars. None of these are egregoric. Tyler's _egregoric flora/fauna devouring terran_ implies a category we don't have. **Egregoric fauna is the right next item — `#25`.** Size M/L, depends on `#8b`, benefits from `#23`. Substrate scope: a parallel fauna register the way #8b is a parallel flora register. Bees with mutated routing. A coyote that came back from somewhere it should not have come back from. An angel whose hash derives from the wrong source. The seeded predecessor footage may contain creatures the current player has never seen, because they were rare, or because they have not yet emerged in this tenure, or because the previous steward saw something the current steward never will.

### Found-footage touchstones (content authorship hints, not new substrate)

> **Astrid:** Tyler named Blair Witch, House of Leaves / backrooms, the Stalker zone. None require new substrate — they describe how `#24`'s procedural footage authors itself and how `#25` interacts with `#23`'s recordings.
>
> - **Blair Witch.** The horror is _the camera kept rolling._ Portable to us: a predecessor's last camera ends mid-frame. The film inside has one less frame than its capacity. **The last frame of a predecessor's last camera is a structural moment we can author into the procedural generator.**
> - **House of Leaves / found documents.** The horror is _the document contradicts itself._ Portable to us: found footage shows tiles in configurations the player's own manual contradicts. _The predecessor's camera shows a clover patch where the player's own map shows ash._ The patch is gone. The footage remains.
> - **The backrooms.** The horror is _liminal, unbounded space._ Portable to us: **a camera that recorded inside a cave that no longer connects to the entrance the player can reach.** The footage exists. The space does not anymore. Or it does, but the player cannot get to it.
> - **The Stalker zone.** The horror is _ordinary objects with cosmologically wrong behavior._ Portable to us: the egregoric register's mechanical surface, already shipped in #8b. What the camera adds: **the act of catching an anomaly on film is itself a small Stalker loop.** _I sense something is wrong with this patch. I will leave a camera and walk away. I will return._

### Discipline: the horror is opt-in by placement

> **Calla:** The horror register must remain optional and rare. The game's primary register is melancholy. A player who plays a calm tenure and does not place cameras near egregoric activity should experience the game as melancholic. A player who places cameras adjacent to egregoric tiles, who explores ruins seeking predecessor footage, who deliberately seeks the seam between worlds — that player experiences the horror register. **The horror is opt-in by placement.** This is consistent with FromSoft. Souls is not exclusively a horror game — it is melancholic for many players and horrifying for others, and which it is depends on what they choose to look at.

> **Astrid:** And the visual treatment does not change. Found footage in the cosmic-horror register uses the same 35mm-rebate visual language as all other camera footage. **The horror is in what is filmed, not in how it is filmed.** This is the right discipline. Blair Witch would not be Blair Witch if the cinematography became expressionist when the witch showed up. _The camera does not know. The camera keeps filming._

### Consensus

- **A second tonal register is admitted into the cosmology: cosmic horror, opt-in by placement.** Melancholy remains primary. Same world, two readings.
- **The egregore is the prairie's heat death rendered as appetite.** Egregoric spread metabolizes native tiles when adjacent and allowed by existing throttle rules.
- **The camera (#23) is the genre's required object.** Found footage is the cosmic-horror medium in a materialist universe.
- **The egregores acquire a fourth register: the unspoken seen.** Glyphic (Voynich), mechanical (spread), visual (violet glyph), observational (caught on film). The fourth register is the only one that doesn't mediate.
- **Procedural predecessor cameras (#24) include egregoric subjects.** Roughly 30% of seeded predecessor footage contains at least one egregoric frame; ~10% is predominantly egregoric. _Some predecessors were eaten. Their cameras kept rolling._
- **Visual treatment unchanged.** Same 35mm-rebate language as all other footage. _The camera does not know. The camera keeps filming._

### Tracked as

- **`#25 Egregoric fauna (the parallel fauna register)`** — size M/L, depends on `#8b`, benefits from `#23`. New item.
- **`#26 Egregoric metabolism (native flora consumption)`** — size XS, depends on `#23`. New item, not an amendment to the shipped `#8b`. The behavior change to `egregore.ts` spread logic is its own tracked work because (a) `#8b` is shipped and its scope is closed; (b) the metabolism's cosmic-horror payoff requires the camera to land first; (c) putting the change on its own line gives it a spec slot, a PR slot, and a place in the dependency graph that the YAML can read. Until `#26` ships, egregoric spread continues to behave as it does in `#8b`'s shipped form.
- **Amendment to `#24`:** procedural footage generation includes egregoric subjects and is content-biased toward the seam. Last-frame-of-the-last-camera moments emerge from procedural generation with template hints rather than being explicitly authored. Captured in `#24`'s notes.

### Open questions deferred to specs

- For `#25`: which fauna types ship in the first cut? (Astrid: at least one with an analog to a native creature — _wrong bee_ — and at least one with no analog. Spec author chooses.)
- For the `#8b` amendment: should metabolic consumption be visible at the moment it happens, or only via camera footage? (Calla: only via camera. Otherwise the player learns by happenstance, which violates the noticing-is-the-game principle. _The camera is how horror is learned._)
- For `#24`: do we author specific "last-frame-of-the-last-camera" moments as templates, or let them emerge from procedural generation? (Boon: lean procedural with template hints. Authoring specific moments risks the same brittleness the activity log had.)

---

## Verification

v4 is a planning artifact, not a code change. Verification is sign-off on:

- The five-line cosmology naming as the top of the doctrine.
- The two-register naming (melancholy primary, cosmic horror opt-in by placement).
- `#14` (delete-event-log) shipped (PR #342).
- `#15` (wear) on the board, spec to be written; round-7 amendment notes the camera as a non-uniform wear case.
- `#16` (the tenure ends) on the board as a sketch with deps on `#4` and `#10`. Round-7 amendment adds inherited cameras + footage to the predecessor record.
- `#23` (time-lapse camera) added to the board, depends on `#15`.
- `#24` (seeded predecessor stewards) added to the board, depends on `#23`. Round-8 amendment biases procedural footage toward egregoric subjects.
- `#25` (egregoric fauna) added to the board, depends on `#8b`, benefits from `#23`.
- `#26` (egregoric metabolism — native flora consumption) added to the board, depends on `#23`. Tracked as its own item so `#8b`'s shipped scope stays closed.
- Soil depletion (`#19`) and NPC mortality (`#20`) on the board as todo, not yet specced.
- The visual genre named descriptively as _retro-futuristic materialist_ — gel-band (`src/components/GelBandView.tsx`, shipped) is the reference artifact future visual decisions can check against.

Each item, when picked up, produces its own `harness/specs/{id}.yaml` and `harness/plans/{id}.yaml` and goes through `npm run spec:validate` → `npm run harness:run` → `npm run verify`.

The session continues — Tyler will bring the next item.
