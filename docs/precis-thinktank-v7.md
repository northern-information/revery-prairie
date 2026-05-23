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

**Locked in round 2:**

- **Two-layer fog of war extends to the overworld.** `gaze`, `memory`, `unseen`. God-mode visibility on the prairie was a placeholder; the cosmology renders correctly with the existing three-state substrate (`unexplored` / `fullyDiscovered` / `visible`) gated on `Zone.Prairie`.
- **Vision radius is unchanged across zones.** Same eyes, indoors or out. No new overworld radius constant; reuse `CAVE_VISION_RADIUS` / `RUIN_VISION_RADIUS`.
- **Simulation does not depend on observation.** Bees, ghosts, coyote, angels, flora lifecycle, weather, and every other system keep running off-screen. Fog culls _rendering passes_, not simulation. Quantum-collapse aesthetics are antithetical to a cosmology where the prairie outlasts every steward.
- **Memory softens, not erases, after Revery.** The steward wakes in the little house; the walk back out should have shape again, but lived history is not wiped. Per-tenure: a new steward inherits a fresh-fog prairie. The Knot remembers; the eyes do not.
- **Player-facing vocabulary is _gaze_, _memory_, _unseen_** — not _fog of war_. Engineering identifiers (`hasFogOfWar`, `fog-mask`) keep their names. No manual entry — this is a well-established mechanic and does not need to be explained in-fiction.

**Locked in round 3:**

- **The prairie has bones.** Verticality belongs — cliffs, escarpments, hill-prairie ecology. Iso projection handles 3D for free; no new glyphs. Player-occluded cliffs go semi-transparent (x-ray) so the steward stays visible.
- **Cave and ruin entrances can be on cliff faces** as well as on the ground.
- **Egregoric flora is thermogenic.** Radiates heat in winter; adjacent flora reads lifted temperature for dormancy. Soft amendment to `#8a` / `#8b`. _Fevers don't burn down — they warm._
- **Geology is winter-only and egregore-driven.** Once-per-year transition on the winter→spring boundary (or mid-Revery — TBD at spec). No real-time terrain mutation. The egregores are the prairie's liver.
- **Ruin re-roll, locked:** year 1 ruins hold key items; year 2+ ruins are roguelike accoutrements only. A sunk ruin costs the steward a small possibility, not progress. Time-budgeting summers is the loop.
- **The player cannot optimize against the geology.** Tending happens regardless; the cosmology is what it is.
- **Wildfire returns as a live mechanic, triggered by lightning.** Thunderstorms can strike, ignite flora, and spread. Cliffs, water, and bare earth act as firebreaks. Scorched tiles recover over multiple years; tallgrass benefits post-burn. _The prairie burns and the prairie heaves; the steward witnesses._
- **The prairie has two axes of motion the steward cannot direct:** slow egregoric geology in winter, sudden lightning fire in summer. Both leave traces the cellar chronicles.

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

---

## Round 2: god-mode is a bug we tolerated

_Tyler: "i think we should introduce two layer fog of war to the overworld. it's vestigial 'god mode' features. it will add dramatic tension for the first exploration as well as during each revery. i think it will help with performance too as we don't have to render everything. we should also reintroduce two layer fog of war to ruins."_

> **Astrid:** The overworld's omniscient view is the last surface where the steward is treated like a satellite, not a walker. Every other system has been bent toward _tending_ — the genetics are observed not engineered (Round 1), the camera does not know (v4), the Knot only records what was hung — and yet the prairie itself, the medium the cosmology is _about_, is rendered to the player as if from orbit. That is the engineering posture leaking through one last vent. A naturalist sees what they have walked toward; the rest is rumor and direction. _The prairie remembers what the steward has visited; the prairie withholds what the steward has not._ Two-layer fog is the cosmology finally rendering correctly: `visible` is the gaze, `fullyDiscovered` is the memory, and `unexplored` is the honest admission that the prairie is bigger than any single tenure. Heat death does not announce itself in advance — it arrives at the edges.

> **Boon:** The substrate already exists. `src/engine/visibility.ts` already runs three states (`unexplored` / `fullyDiscovered` / `visible`) and the `fog-mask` render pass already handles them; `hasFogOfWar(zone)` currently returns true for `Zone.Cave` and `Zone.Ruin` only. So extending to the overworld is a gating change plus a per-tenure persistence question — not new infrastructure, and not a new vision radius. _It is the same eyes seeing_, indoors or out; reusing `CAVE_VISION_RADIUS` / `RUIN_VISION_RADIUS` keeps the cosmology honest and the constants honest. Two notes on the framing. First, the "reintroduce to ruins" beat — ruins still have two-layer fog; nothing was removed. What's missing in ruins is the same thing the overworld needs and the same thing Tyler is really pointing at: _the memory layer should not be permanent across a tenure when a Revery has passed_. Today `fullyDiscovered` never decays. Second, the perf claim is real but smaller than it sounds — bg cache still builds once per tile, so the savings come from culling visual entity passes (rendered bees, ghosts, particles, flora overlays) outside the visible radius. The simulation underneath those passes keeps running. Bill the work as _clarity_, not framerate. Files in play: `visibility.ts`, `render/passes/fogMask.ts`, the Revery phase machine, and per-tenure FOW persistence in `GameState`.

> **Calla:** First-tenure exploration today is flat — you spawn and the prairie is just _there_, all 147×147 of it, no horizon to walk toward. Adding overworld fog turns the opening session into a shape: a circle of gaze, a band of memory, and a wall of "not yet." That is the texture the camera (`#23`) and predecessors (`#24`) have been hinting at but couldn't carry alone. The Revery beat is the elegant one once the framing is right: the steward isn't out in the prairie during Revery — they're inside the little house, the prairie dreams, and they wake up and walk back out. _The door opens onto a prairie that has moved on without them._ The memory layer doesn't have to vanish entirely — full re-darken would erase the steward's lived history — but it should soften enough that the walk back out has shape again. Across tenures the question is cleaner: a new steward should inherit a fresh prairie, even if it's the same map. The Knot remembers; the eyes do not. That is the loop.

> **Delta:** God-mode is not a feature, it's a bug we tolerated because rendering was cheap and the cosmology was still being written. It was always a placeholder. The line to take forward: _discovery isn't a UI state, it's a tenure_. The prairie is not a level you clear; it is a place you walk in for a finite time, and what you saw is what you saw. One thing the room should lock while it's here: fog is a visibility surface, not a simulation gate. Bees keep flying, ghosts keep drifting, the coyote keeps doing whatever the coyote does — the prairie does not pause when the steward looks away. _The trees do not stop when no one is in the forest._ Quantum-collapse aesthetics are antithetical to a cosmology where the prairie outlasts every steward. And the room should also stop calling this "fog of war" outside engineering — _war_ is the wrong word for a meadow. Engineering keeps `hasFogOfWar`; the player surfaces use _gaze_, _memory_, _unseen_.

### Consensus

- Extend two-layer fog of war to the overworld. `hasFogOfWar(Zone.Prairie)` returns true; the same three states (`unexplored` / `fullyDiscovered` / `visible`) and the existing `fog-mask` pass carry over.
- Vision radius is unchanged across zones — same eyes, indoors or out. Reuse the existing radius constants; no new overworld constant.
- Simulation does not depend on observation. Bees, ghosts, coyote, angels, flora lifecycle, weather, and every other system keep running off-screen. Fog culls _rendering passes_, not simulation. This is a hard cosmological lock.
- Ruins are not regressed — two-layer FOW still ships there. The "reintroduce" framing in the seed is a recognition that the `fullyDiscovered` memory layer is currently permanent across a tenure; it should not be.
- Per-Revery memory softening: the player is in the little house during Revery and wakes there after. On Revery exit, the `fullyDiscovered` layer softens (not erased) so the walk back out has shape. The steward retains lived history; the prairie has moved on.
- Per-tenure FOW reset: a new steward inheriting the cellar starts with a fresh-fog prairie. The Knot remembers; the eyes do not.
- Perf benefit is real but secondary: cull entity render passes outside the visible radius. Bill the work as clarity and cosmology, not framerate.
- Player-facing vocabulary is _gaze_, _memory_, _unseen_ — not _fog of war_. Engineering identifiers stay (`hasFogOfWar`, `fog-mask`); no manual entry — this is a well-established mechanic and does not need to be explained in-fiction.

### Tracked as

- **`#38 Overworld gaze, memory, and unseen`** — M, depends on existing visibility substrate. Extend `hasFogOfWar` to `Zone.Prairie`, persist FOW state on `GameState` per tenure, reuse existing vision radius, cull entity _render_ passes outside the visible radius (simulation continues).
- **`#39 Post-Revery memory softening`** — S, depends on `#38` and `#0` (Reclaim Revery). On Revery exit (steward wakes in the little house), the `fullyDiscovered` layer softens so the walk back out has shape again. Memory persists but dims.
- **`#40 Per-tenure FOW reset`** — S, depends on `#38` and `#24` (Predecessor stewards). A new steward starts with a fresh-fog prairie; the Knot retains lineage, the eyes do not.
- **Amendment to `#0` Reclaim Revery:** Revery exit becomes a hook point for the memory-softening effect (`#39`). No behavior change to the phase machine itself; just a new observer.

### Open questions deferred to specs

- Exact softening curve for `fullyDiscovered` tiles on Revery exit — partial fade, time-based decay, or one-shot dim. Tuning target: walk-out has shape, lived history is not erased (Calla).

---

## Round 3: the prairie has bones now

_Tyler: "what if we introduce more verticality to the game? cliffs are important for blocking wildfire, for example. but taking it to the next level, what if we had dramatic / unstable geology in winter. relates to egregora. impassable terrain. check priors on prairies needing to be flat. caves/ruins entrances can actually be on walls. new ruins can be revealed as tiles upwell. old ones can go away. think egregoric rhizomes. maybe thermal activity triggers geological activity. seismographs are a complement to cameras. also: i think the egregoric flora is thermogenic — so it radiates heat in winter."_

### Verticality and the prior

> **Astrid:** The flat-prairie image is a postcard, not a biome. The Loess Hills run two hundred miles up the western edge of Iowa, fifty to two hundred feet of vertical loess soil holding a hill prairie ecosystem unique on the continent; the glades of the Ozark plateau drop sheer; Illinois has hill prairies that exist precisely _because_ the south-facing bluff stays too dry for forest. Tyler's instinct is correct: the prior is a cliché, not a constraint. _Verticality belongs._ What the cosmology gains is also load-bearing — the prairie has had weather, lineage, and tenure as its dimensions of change; it has not had _shape_. Bones. A walker who can see a cliff from across the prairie has an orienting feature the way a real prairie walker has the river bend or the lone bur oak. The horizon stops being a uniform fade and becomes geography.

> **Boon:** Iso projection does the verticality for free — a cliff is a column of the existing tile glyph stacked in the z-axis, no new glyphs, no z-buffer math beyond the iso depth sort already running. The pass registry handles it. The real implementation cost is line-of-sight occlusion: a cliff tile in front of the steward will hide the steward's avatar and any tile behind it, and that is a UX failure the fog system (`#38`) cannot paper over. Two options: x-ray, where a cliff tile becomes semi-transparent when it occludes the player or a player-relevant tile (cheaper, no new projection); or camera rotation, where the iso angle flips on input (expensive — the bg cache and every existing render pass assume a single projection). Lean: x-ray, ship first. Camera rotation as a follow-up only if x-ray fails the feel test. Movement and the fog of war handle cliffs naturally — impassable tile, gaze radius truncates at the cliff face. Cliffs-as-firebreaks does become real once wildfire returns via `#42` (lightning-triggered) — placement of major escarpments should consider firebreak geometry, not just landmark legibility.

> **Calla:** Cliffs give the prairie a shape the steward can _carry in their head_. Right now the 147×147 grid has no landmarks except the river bend, the cave mouth, and the little house — three pinpricks in a sea of sameness. Add a north cliff line and you have a north. Add a south escarpment and the prairie has a basin. Each tenure starts with the same bones but the steward learns them differently. The occlusion fix has to keep the steward visible at all times — the player loses their avatar even for a tick and the prairie becomes a maze. X-ray on player-occluded cliffs is the right shape; a soft alpha on the cliff face so the steward stays drawn. The cliff itself loses no presence — you still see it, you just see _through_ it where it would have hidden you.

### Thermogenic egregores

> **Astrid:** _Heat death is the antagonist; the egregore is a fever._ This is the right flip. The current model — egregore active in winter, dormant otherwise — already encodes that they are out-of-phase with the prairie, but it leaves them as cold-survivors. Thermogenesis turns them into cold-_refusers_. They generate heat against the season, which is the smallest and most universe-relevant gesture a system can make: a pocket of anti-entropy. The prairie has been losing its slow battle with heat death the whole time; the egregores are also losing it, but on the opposite axis, and the way they lose is by being warm where nothing should be warm. The cosmology gains a paradox: the player wants the cosmologically-wrong thing (the egregore) precisely when the cosmologically-right thing (the meadow) has gone dormant. _Fevers don't burn down. They warm._

> **Calla:** Player-experience-wise this is delicious. Winter is the dead season — the meadow dormant, the bees gone, snow over the field. Today there's no reason to walk anywhere in winter except house and cellar. Thermogenic egregores create a _reason_ that the cosmology should be ashamed of: warmth. The steward goes out into the snow, drawn toward the violet patches, and the moment they get close they have to reckon with what they came for. This is the same loop that ghosts have but inverted — you go _toward_ the thing you should fear, not away. And the heat radiates in a radius, which means flora behavior near egregores in winter could read differently — a dormant clover patch one tile from a thermogenic egregore stays soft-green instead of grey. The visible signal is already in the rendering substrate.

> **Boon:** Implementation is a soft amendment to `#8a` / `#8b`, not a new precis. Add a `thermogenicRadius` (or rolled into the existing `EgregoreGenome.allelopathy` field if the gradient already exists — needs check) and an effective-temperature lift on tiles within the radius during winter. Flora dormancy check (`src/engine/flora/lifecycle.ts` area) reads the lifted temperature instead of the raw `weather.temperature`. Cheap. The visible signal — adjacent flora not-yet-dormant in winter — does not need a new render pass; existing color logic handles it.

### Winter geology and the ruin re-roll

> **Astrid:** The right framing landed: geology is _what the egregores do_ when no one is looking. Winter is when the meadow sleeps and the egregores are at their most metabolic — they are the prairie's wakeful season. Their thermogenesis isn't only above-ground heat; it's pressure underneath. Where the rhizomes propagate, the ground rises; where they retreat or starve, the ground sinks. This makes the egregore the prairie's _liver_, not just its fever — the organ that processes and reshapes. And because the work happens in winter, when the steward is closer to the house and the prairie has gone quiet, the player wakes one spring to a prairie that has moved. _The cosmology has weather; now it has bones; the bones turn over in winter._

> **Boon:** Winter-only and egregore-driven simplifies this dramatically. No real-time terrain mutation, no per-tick geological simulation. The mutation is a _seasonal transition_, applied once per year on the winter→spring boundary (or possibly winter→winter mid-Revery boundary, TBD at spec), the same way seasonal palette wash already runs. Touch points: a single function in the season transition path that walks egregoric tiles, evaluates their thermogenic activity over the past winter, and applies geology — surface a new ruin in unseen territory near a strong rhizome, sink a ruin that has not been visited recently. Cliffs may also rise or fall on the same boundary if we want, smaller scope decision. The expensive piece is still ruin _generation_ at runtime — `generateAllRuinInteriors` currently runs only at genesis. Lifting it to a runtime call is the spec's real work. Ruin sinking is cheap (tile-flip + interior dereference). Ruin surfacing is the part that needs the new infrastructure.

> **Calla:** And here's the loop that makes the whole thing click — the ruin re-roll. Today ruins are one-shot content; you open the gate, you take the items, you never go back. Tyler's been working at this: after year 1, ruins are roguelike accoutrements, not key-item gates. Year 1 ruins hold the foundational items (the camera, the cellar key, whatever the first tenure needs to bootstrap). Year 2+ ruins are flavor — a hat, a chair, a journal page, a brittle artifact — never a key. _That_ is what makes "you missed it and it sank" land as cosmology rather than punishment. The steward did not lose progress; the steward lost a small possibility. The summer becomes a budgeting question: which ruin do I visit before winter takes it? The careful steward visits everything within reach; the dreamier steward picks one ruin and reads it slowly and accepts that the others will be gone in spring. Both are valid; the prairie does not judge.

> **Delta:** The static map was always a budget choice masquerading as a cosmology. Round 2 said the prairie moves on without the steward; this round says the prairie _has a body_ that moves without the steward — not just an absence at the edges, but an active geology beneath. And the ruin re-roll is what gives that any teeth. A prairie that mutates without consequence is a screensaver; a prairie that takes ruins back is one the steward must reckon with. _The cosmology has weather; now it has bones; the egregore is the pulse._ The egregore stops being only a thematic infection of the manual and becomes the engine of the prairie's actual motion. That is the right job for it.

> **Astrid:** And the other half of the cosmology's bright sister — _lightning_. Heat death is the long antagonist; lightning is the brief one, the universe's reminder that energy is not only running down but occasionally _striking_. Wildfire returns to the round as a live mechanic, triggered by lightning during the warm seasons. This is the cosmology's other axis of motion: egregores reshape the prairie slowly in winter from below; lightning reshapes it suddenly in summer from above. Both are forms the steward cannot direct; both leave traces the cellar can chronicle. _The prairie burns and the prairie heaves; the steward witnesses._

> **Boon:** Lightning is a strike event, not a continuous mechanic. Weather already has rain (`precipitationIntensity`) and storm sky states; lightning is a probabilistic event during thunderstorm conditions — pick a random tile (weighted toward flora or tall features), apply ignition, let the fire spread. Spread substrate is BFS over adjacent flora, the same shape as the genesis Burn already implements in `genesis.ts` — lift that to a live system. Cliffs and water act as firebreaks naturally (impassable to fire). Bare earth too. The cost is the live render — a fire pass that updates each tick, smoke, scorched-tile state — and the cleanup, which is its own little ecology (scorched soil over a few years recovers; some species do better post-burn, which is actual prairie ecology — tallgrass thrives after fire). Scope for `#42`: ignition + spread + scorched-tile state + multi-year recovery curve. Fire weather (humidity, wind direction) defer to spec.

> **Calla:** Wildfire is the prairie's other punctuation. Winter geology says _the prairie has a body_; summer lightning says _the prairie has a temper_. The combination is the right shape — winter takes things from the steward slowly and patiently; summer takes things from the steward suddenly and violently. Both are forms of loss the steward cannot prevent. And tallgrass-after-fire is one of the real prairie's truest loops — the burn that looks like ending is also the restart. The careful steward learns to read the storm sky and stays close to the cellar or the river when the sky goes wrong. The reckless one walks out anyway.

> **Astrid:** Two cosmology guards on this. First: the steward's lived memory must be intact. Calla named this in the previous draft and it carries — the cellar remembers what the prairie lets go. A ruin that sinks is a record in the Knot, not a wipe. Second: the player should _not_ be able to optimize against the geology. No "I will skip the egregores so the ruins stay put." The cosmology is what it is; tending happens regardless. The thermogenic patches stay where they spread; the rhizomes propagate; the geology turns over. The steward witnesses.

### Seismographs

> **Boon:** Seismographs ride on the camera substrate (`#23`, not yet shipped). Same placement loop: pick a tile, anchor a device, the device records events over time, the steward returns and reads the record. Camera records visual events; seismograph records geological-thermal events — egregoric heat pulses through the prior winter, rhizome reach, the trace of a ruin that has surfaced or sunk. Different sensor, same substrate. With geology locked as a once-per-year winter transition, the seismograph's job is to give the steward _last winter's_ record — a printout of what the egregores did while the meadow slept. Defer until `#23` is built; the seismograph spec should be a slim sibling, not a parallel system.

> **Astrid:** The cosmology gains a second sense. Sight is the steward's gaze (`#38`); cameras let the steward see what happened where they weren't (`#23`); seismographs let the steward _feel_ what happened where they weren't, and in winter, what happened while they slept. The prairie is too large to be perceived in one sense alone, and now also too slow — most of its motion happens at a tempo the steward does not directly inhabit. _The naturalist has a notebook, a camera, and now a needle on paper._ The seismograph also surfaces the egregoric rhizome layer to the player without ever rendering it directly — the steward sees the trace of the pulse, not the rhizome itself. That preserves the egregore as unknowable while making its underground metabolism legible.

> **Calla:** The seismograph is also the player's tool for budgeting their summer. If last winter's seismograph reading shows a strong pulse under the north field, the careful steward visits whatever ruins are out there _before_ next winter, knowing that field is geologically active. The slow observation rewards the patient player without telling the impulsive one anything they couldn't have figured out by walking. Same shape as cameras-and-cellar: the prairie shares its confidence with whoever pays attention.

### Consensus

- **Verticality belongs.** Cliffs are real prairie ecology (Loess Hills, hill prairies, Ozark glades). The flat-prairie image is a cliché, not a constraint. Iso projection handles 3D for free — no new glyphs, just stacked existing tiles in the z-axis.
- **Cave and ruin entrances can be on cliff faces** as well as on the ground; entrance render becomes an arch in the cliff face.
- **Line-of-sight occlusion is the real cost of verticality.** Lean: x-ray on player-occluded cliff tiles (semi-transparent when they would hide the steward or player-relevant tiles). Camera rotation deferred; only revisit if x-ray fails the feel test.
- **Egregoric flora is thermogenic.** Soft amendment to `#8a` / `#8b`. Egregore tiles radiate heat in winter; flora within radius reads the lifted temperature for dormancy checks. The steward is drawn toward the cosmologically-wrong thing for the cosmologically-right reason (warmth). _Fevers don't burn down — they warm._
- **Geology is winter-only and egregore-driven.** No real-time terrain mutation. Geological events apply once per year on the winter→spring boundary (exact boundary TBD at spec), evaluating the prior winter's thermogenic activity. The egregores are the prairie's liver — the organ that reshapes.
- **Ruin re-roll, locked:** year 1 ruins hold key items (foundational tools — camera, cellar key, whatever bootstraps the first tenure). Year 2+ ruins hold only roguelike accoutrements (hats, chairs, journal pages, brittle artifacts). A ruin that sinks costs the steward a small possibility, not progress. Time-budgeting their summers is the loop; the prairie does not judge.
- **Steward's lived memory is intact.** Sunk ruins are recorded in the cellar (`#37`); the Knot remembers what the prairie lets go.
- **The player cannot optimize against the geology.** No "skip the egregores so the ruins stay put." Tending happens regardless; the cosmology is what it is.
- **Wildfire returns as a live mechanic, triggered by lightning.** Thunderstorms during warm seasons can strike, ignite flora, and spread. Cliffs, water, and bare earth act as firebreaks. Scorched tiles recover over multiple years. Tallgrass benefits post-burn (real prairie ecology). The prairie has two axes of motion the steward cannot direct: slow egregoric geology in winter, sudden lightning fire in summer.
- **Seismographs are cameras' second sense.** Sibling spec to `#23`, defers until `#23` ships. Records the prior winter's geological-thermal events. Surfaces the rhizome layer without rendering it directly.

### Tracked as

- **`#41 Cliffs and verticality`** — M, no deps. Impassable cliff tile type using stacked iso projection; no new glyphs. X-ray on player-occluded cliff tiles for LOS. Optional: cave and ruin entrances placed on cliff faces. Hill-prairie precedent (Loess Hills, IL bluffs) named in spec.
- **`#42 Live wildfire (lightning-ignited)`** — M, depends on `#41` (cliffs as firebreaks). Thunderstorm + lightning strike + BFS fire spread + scorched-tile state + multi-year flora recovery curve (tallgrass benefits). Lifts the genesis Burn substrate from `genesis.ts` to a live system.
- **`#43 Thermogenic egregores`** — S, soft amendment to `#8a` / `#8b`. Egregoric flora radiates heat in winter; adjacent flora reads lifted temperature for dormancy. New `EgregoreGenome.thermogenicRadius` field (or rolled into existing gradient — confirm at spec).
- **`#44 Winter geology and ruin re-roll`** — L, depends on `#41`, `#43`, `#37` (cellar). Once-per-year winter→spring geological transition driven by egregoric thermogenic activity. Surface new ruins in unseen territory; sink ruins that have not been visited recently. Year 1 ruins hold key items; year 2+ ruins are roguelike accoutrements only. Sunk ruins logged in the cellar Knot. Will need its own thinktank round when next.
- **`#45 Seismographs`** — M, depends on `#23` (Camera) and `#44`. Sibling sensor to the camera; records the prior winter's geological-thermal events. Surfaces the egregoric rhizome layer without rendering it directly. Built as a slim variant of `#23`'s substrate.
- **Amendment to `#8a` / `#8b`:** thermogenesis added via `#43` as a separate small precis rather than reopening `#8a`/`#8b` for re-spec.

### Open questions deferred to specs

- (Boon) cliff rendering depth — single-stack vs taller bluffs, and whether cliff heights vary by feature. Lean: 2–3 tile-equivalent vertical extent, hand-placed major escarpments + procedural minor cliffs.
- (Astrid) whether cliffs should be hand-placed at genesis as named features (the way the river and cave mouth are) or procedurally generated. Lean: hand-placed majors + procedural minors.
- (Calla) tuning the egregoric heat radius so the steward is _drawn_ but not _saved_ — close enough to feel warm should still be cosmologically suspect.
- (Boon) for `#44`, whether the once-per-year boundary fires on winter→spring (clean, observable) or mid-winter during Revery (more cosmologically dramatic — geology happens _while_ the steward is in the dream).
- (Boon) for `#44`, where new ruin interiors come from — pre-generated pool waiting underground vs runtime generation. The latter is harder but doctrinally cleaner (the prairie generates them).
- (Calla) tuning the un-visitation threshold for ruin sinking — single tenure, multiple tenures, or some weighted measure. Don't sink a ruin a steward visited last summer; do eventually sink one no steward has touched in a generation.
- (Boon) lightning frequency and storm-state coupling — should every thunderstorm risk a strike, or only some? Calibrate so fires are rare but consequential.
- (Astrid) whether lightning-struck flora should ever produce something the steward can gather — burnt seeds, charred clover, ash with cosmological resonance. Defer to flora-recovery spec; flag for future round if it becomes a system.
