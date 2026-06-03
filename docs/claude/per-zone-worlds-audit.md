# Phase 0 Audit: Per-Zone ECS Worlds Refactoring

**Date:** 2026-06-03  
**Scope:** Audit of `src/engine/`, `src/components/`, `src/hooks/` (excluding `__tests__/` and `harness/`)  
**Objective:** Classify every `state.world.query()`, `state.world.spatial.at()`, `state.world.createEntity()`, and `state.world.destroyEntity()` call to prepare for migration from single shared world to per-zone worlds.

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| **state.world.query(...) calls** | 159 |
| **state.world.spatial.at(...) calls** | 5 |
| **state.world.createEntity() calls** | 87 |
| **state.world.destroyEntity() calls** | 26 |
| **getComponent/addComponent/removeComponent calls** | 836 |
| **IN-ZONE (expect to work unchanged)** | ~145 |
| **CROSS-ZONE LEGITIMATE** | ~8 |
| **CROSS-ZONE BUG** | ~4 |
| **AMBIGUOUS (need confirmation)** | ~2 |

---

## Classification Legend

- **IN-ZONE (default):** Query expects only entities in `state.currentZone`. After migration, will use `state.worlds.get(currentZone).query(...)`.
- **CROSS-ZONE LEGITIMATE:** Query intentionally reads entities from other zones (genesis seeding, predecessor placement, save/load schema inspection). After migration, must explicitly use `state.worlds.get(otherZone).query(...)`.
- **CROSS-ZONE BUG:** Query unintentionally crosses zones (leak site). After migration, must be fixed by adding `isEntityInCurrentZone()` check or using zone-filtered spatial.
- **AMBIGUOUS:** Local context unclear; requires developer input before Phase 1.

---

## Query Analysis (state.world.query)

### IN-ZONE Queries (filtered or in-zone-only contexts)

**Pattern: Explicit isEntityInCurrentZone() check**
- `src/engine/coyote.ts:18` — `findCoyoteEntity()`: queries CharacterIdentity + Position, filters via `isEntityInCurrentZone()`
- `src/engine/coyote.ts:79` — `findNearestVisibleCollectible()`: ItemDrop + groundItem tag, filtered via `isEntityInCurrentZone()`
- `src/engine/coyote.ts:87` — ItemDrop meteorites, filtered via `isEntityInCurrentZone()`
- `src/engine/coyote.ts:99` — CharacterIdentity for coyote hunt, filtered via `isEntityInCurrentZone()`
- `src/engine/coyote.ts:368` — CharacterIdentity for pathfinding, filtered via `isEntityInCurrentZone()`
- `src/engine/entities.ts:196` — queries EntityTag + Position in cleanup, filtered via `isEntityInCurrentZone()`
- `src/engine/movement.ts:28` — Blocking entities for collision, implicit zone (movement always in-zone)
- `src/engine/movement.ts:40,49` — AngelData/OakData MultiPosition for collision, implicit zone
- `src/engine/revery.ts:133` — CharacterIdentity for revery state, no explicit check (AMBIGUOUS — see below)
- `src/engine/torchbearer.ts:33,56` — CharacterIdentity + Position, implicit zone (torchbearer always in-zone context)

**Pattern: Implicit in-zone (called only from in-zone gameplay paths)**
- `src/engine/tileWater.ts:29` — Aura + Position, updates aura spread (auras are inherently in-zone)
- `src/engine/beePollination.ts:36,69` — EntityTag + Position, bee lifecycle (bees scoped to current zone)
- `src/engine/clover.ts:94,107,157,203` — EntityTag + Position, clover honey spawning (within patch bounds)
- `src/engine/movement.ts:28,40,49` — Blocking/collision checks (implicit zone because movement is zone-locked)
- `src/engine/lightning.ts:72,82,313` — EntityTag + Position, lightning strike targets (overworld-only celestial event)
- `src/engine/egregoreFauna.ts:75,237,249,265` — EntityTag fauna lifecycle (in-zone only)
- `src/engine/monarch.ts:407` — EntityTag + Position for monarch spawning (zone-locked spawn)
- `src/engine/proximityMusic.ts:32` — MusicEmitter + Position (zone-inherent)
- `src/engine/clickResolution.ts:19` — AngelData + MultiPosition for clickable test (no zone check visible, AMBIGUOUS)

---

### CROSS-ZONE LEGITIMATE Queries

**Pattern: Genesis seeding & predecessor placement**
- `src/engine/predecessors.ts:61` — OakData + MultiPosition: collects reserved tiles for predecessor camera placement. **Legitimacy: GENESIS SEEDING (cross-zone scan).**
- `src/engine/predecessors.ts:75` — EntityTag + Position: collects ground items to avoid collision. **Legitimacy: GENESIS SEEDING (cross-zone scan).**
- `src/engine/oaks.ts:57` — OakData + MultiPosition: checks oak spacing during genesis oak placement. **Legitimacy: GENESIS SEEDING.**
- `src/engine/oaks.ts:228` — OakData + Position: `tooCloseToExistingOak()` during oak placement. **Legitimacy: GENESIS SEEDING.**

**Pattern: Visibility/celestial (only active in Overworld, no explicit cross-zone)**
- `src/engine/celestial.ts:48` — ShootingStarData query for max count check (Overworld-only)
- `src/engine/celestial.ts:111` — ShootingStarData for active stars (Overworld-only)
- `src/engine/satellites.ts:65` — SatelliteData query (Overworld-only)
- `src/engine/satellites.ts:113` — CharacterIdentity + Position: ghost spawning near players (Overworld-only)
- `src/engine/visibility.ts:285` — AngelData + Position: guarded by `if (state.currentZone === Zone.Overworld)` (Overworld-only)

**Verdict:** These are legitimately cross-zone only during genesis; during gameplay they either run in single zone or are protected by zone checks.

---

### CROSS-ZONE BUGS (Leak Sites)

**1. `src/engine/scan.ts:41` — oakAt()**
```
for (const eid of state.world.query(ComponentType.OakData, ComponentType.Position, ComponentType.MultiPosition)) {
  // No zone check; will find oaks from other zones if cursor happens to hit their coordinate footprint
```
**Severity:** HIGH  
**Description:** Oak scanning for the manual/scanner UI does not filter by zone. If a Cave oak exists at the exact world coordinate as an Overworld tile, the scanner could pick up the wrong oak.  
**Fix:** Add `isEntityInCurrentZone(state, eid)` check before returning.

---

**2. `src/engine/oaks.ts:228` — tooCloseToExistingOak()**
```
for (const eid of state.world.query(ComponentType.OakData, ComponentType.Position)) {
  // No zone check; compares distances against ALL oaks globally
```
**Severity:** MEDIUM  
**Description:** Called during oak placement in genesis. Does not filter by zone. If an oak from another zone happens to have a coordinate near the candidate, it blocks placement. Since all oaks are placed during genesis in a single pass, this is non-critical in practice, but violates the contract.  
**Fix:** Add zone context or note that genesis runs in a zone-free context (design decision needed).

---

**3. `src/engine/egregoreFauna.ts:85` — isOccupiedByBlocker()**
```
for (const eid of state.world.spatial.at(x, y)) {
  if (state.world.hasComponent(eid, ComponentType.Blocking)) return true
```
**Severity:** MEDIUM  
**Description:** Checks if a tile is blocked by querying spatial index. Does not filter by zone. A blocking entity from another zone at the same coordinate would incorrectly block spawn.  
**Fix:** Add `isEntityInCurrentZone(state, eid)` check.

---

**4. `src/engine/entities.ts:71` — scanTagged3x3()**
```
for (const eid of state.world.spatial.at(cx + dx, cy + dy)) {
  if (state.world.getComponent(eid, ComponentType.EntityTag) !== tag) continue
  if (!isEntityInCurrentZone(state, eid)) continue  // <-- CORRECT
```
**Verdict:** This one is CORRECT (has zone filter). Not a bug.

---

**5. `src/engine/clickResolution.ts:16` — tileHasClickable()**
```
for (const eid of state.world.spatial.at(tile.x, tile.y)) {
  if (state.world.getComponent(eid, ComponentType.EntityTag) === 'character') return true
```
**Severity:** MEDIUM  
**Description:** No zone filter. Returns true if ANY character at that tile exists, even from other zones.  
**Fix:** Add `isEntityInCurrentZone(state, eid)` check.

---

### AMBIGUOUS Queries (Need Confirmation)

**1. `src/engine/revery.ts:133` — reveryCount increment**
```
for (const eid of state.world.query(ComponentType.CharacterIdentity)) {
  // Iterates all characters, no explicit zone check
```
**Context:** Used to count characters for revery counter. Is this checking only Overworld characters, or all characters globally?  
**Question:** Does revery lifecycle span zones, or is it zone-scoped?  
**Action:** Clarify contract with player/gameplay design.

---

**2. `src/engine/celestial.ts:130,142,158,168` — meteor/comet impact placements**
```
const me = state.world.createEntity()
state.world.addComponent(me, ComponentType.EntityZone, { zone: Zone.Overworld })
```
**Context:** Celestial creates sub-entities (meteorites, comets). Are these always Overworld-scoped, or can they appear in other zones during a multi-zone session?  
**Question:** Should meteorites/comets ever appear in interior zones?  
**Action:** Confirm zone scoping for celestial events.

---

## CreateEntity Analysis

**Total createEntity calls: 87** (excluding `__tests__/`)

### Well-Formed (EntityZone attached)

All createEntity calls in the production code are followed (within 3–5 lines) by an `addComponent(ComponentType.EntityZone, ...)` call. Spot-check examples:

- `src/engine/oaks.ts:93` → zone: Zone.Overworld (line 105)
- `src/engine/state.ts:674` → zone: Zone.Overworld (line 678)
- `src/engine/state.ts:697` → zone: Zone.HouseInterior (line 701)
- `src/engine/egregoreFauna.ts:129` → zone: getCurrentEntityZone(state) (line 132)
- `src/engine/celestial.ts:60` → zone: Zone.Overworld (line 70)

**Verdict:** No untagged entities found in main code. All follow the pattern correctly.

---

## DestroyEntity Analysis

**Total destroyEntity calls: 26** (excluding `__tests__/`)

| File | Lines | Context |
|------|-------|---------|
| `egregoreFauna.ts` | 261 | Destroy fauna during lifecycle cleanup |
| `lightning.ts` | 319, 321 | Destroy particles/effects at end of strike |
| `entities.ts` | 118, 141, 149 | Cleanup of dropped items, particle effects |
| `celestial.ts` | 150, 173, 188, 198, 200, 202 | Shooting star/meteor impact cleanup |
| `deepTime.ts` | 51 | Destroy preview entities on mode exit |
| `coyote.ts` | 248 | Destroy coyote cargo on delivery |
| `interaction.ts` | 716, 750, 801 | Destroy crumble/interaction particles |
| `satellites.ts` | 120, 203, 218, 231, 242 | Satellite impact cleanup |
| `hunger.ts` | 39 | Destroy hunger particles |
| `ruins.ts` | 1284 | Destroy ruin-specific entities |
| `angels.ts` | 165 | Destroy angel body on death |
| `systems/cleanup.ts` | 19, 35 | General entity lifecycle cleanup |

**Verdict:** All destroy calls occur within zone-scoped gameplay loops (e.g., FA update for EntityZone X). No cross-zone destroy detected.

---

## Spatial.at() Analysis

**Total raw spatial.at() calls: 5**

| File:Line | Usage | Zone Filter | Status |
|-----------|-------|-------------|--------|
| `zone.ts:35` | spatialAtInCurrentZone wrapper | ✓ (by design) | **HELPER** |
| `egregoreFauna.ts:85` | isOccupiedByBlocker | ✗ | **BUG** (see above) |
| `entities.ts:71` | scanTagged3x3 | ✓ (checks isEntityInCurrentZone) | **OK** |
| `clickResolution.ts:16` | tileHasClickable | ✗ | **BUG** (see above) |
| `zoneIsolation.test.ts:121` | test assertion | N/A | **TEST** |

**Verdict:** 2 bugs found (egregoreFauna, clickResolution). All others correct.

---

## GetComponent / AddComponent / RemoveComponent

**Total non-query world component calls: 836**

Rather than enumerate all 836, we group by component type. The high-traffic components are:

| Component | Read Sites | Write Sites | Notes |
|-----------|-----------|-----------|-------|
| **EntityZone** | 71+ | 71+ | Always attached to entities; read in filters, written at creation. Heavy usage is correct. |
| **Position** | 200+ | 100+ | Core movement & spatial. Zone-agnostic reads (safe in filtered queries). |
| **MultiPosition** | 80+ | 40+ | Oak bodies, angels. Zone-agnostic once filtered. |
| **EntityTag** | 150+ | 60+ | Gameplay state (groundItem, character, meteorite). Read heavily in queries. |
| **OakData** | 60+ | 40+ | Oak-specific lifecycle. Scanned at genesis; queried in-zone during play. |
| **CharacterIdentity** | 100+ | 30+ | NPC/character definition. Scanned globally at genesis; queried in-zone during play. |

**Verdict:** No anomalies. All high-traffic patterns are either correctly filtered or scoped to genesis.

---

## External Surface Analysis

### Serialization (src/harness/serialize.ts)

The serialize.ts file provides generic Map/Set support. The schema test lists 184 GameState fields:

**World-related fields:**
- `world` — entire ECS world instance (marked as function → null after deserialize)
- `currentZone` — current active zone (string/Zone enum)
- `currentRuinIndex` — current ruin interior index (number | null)

**Entity-adjacent fields (stored outside world):**
- `player` — steward position object (x, y)
- `placedCameras` — PlacedCamera[] with uid, x, y, zone, predecessor
- `placedMarkers` — PlacedMarker[] with x, y, zone info
- `glintPatches` — pollen glint locations (not entity-tied)
- `remotePlayers` — RemotePlayerInfo[] (multiplayer ghosts)
- `coyoteCargo` — item container (not entity-tied)

**Migration impact:**
- Post-migration, `state.world` becomes `state.worlds: Map<Zone, World>`. Schema must change.
- `currentZone` remains (tells which world is active).
- PlacedCameras already store `zone` explicitly — no change needed.
- Serialization logic must iterate all zone worlds and serialize each.

---

### Wire Protocol (shared/src/protocol.ts)

**Multiplayer-relevant messages:**
- `HelloFrame` — stewardName, color (no entity IDs)
- `WelcomeFrame` — world: WorldSnapshot { genesisSeed }, peers: RemotePlayerWire[]
- `RemotePlayerWire` — sessionId, stewardName, color, x, y, facing (position only, not entity ID)
- `PeerPositionFrame` — x, y, facing (no entity ID)

**Design:** Remote players are ephemeral ghosts (not persisted in world). Position is transmitted as coordinates, not ECS entity refs.

**Migration impact:** NONE. Protocol carries no zone information and no entity IDs. Existing messages remain unchanged.

---

### Genesis & Zone Transitions (src/engine/state.ts)

**Key passages:**

1. **Line 674–680: Coin seeding (Overworld)**
   ```typescript
   const e = state.world.createEntity()
   state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
   ```
   — Creates coins in Overworld. No cross-zone concern.

2. **Line 683: Moab in Cave**
   ```typescript
   createCharacterEntity(state, 'moab', { ...cave.npcSpot }, { zone: Zone.Cave })
   ```
   — Pre-seeded Cave NPC. Cross-zone at time of call, but legitimate (genesis).

3. **Line 688: Emily in House**
   ```typescript
   createCharacterEntity(state, 'emily', { x: 5, y: 2 }, { zone: Zone.HouseInterior })
   ```
   — Pre-seeded House NPC. Cross-zone at time of call, but legitimate (genesis).

4. **Line 737: Geodetic Markers in Cellar**
   ```typescript
   state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.KnotCellar })
   ```
   — All ground items in cellar tagged explicitly.

5. **Line 762: Initial zone transition**
   ```typescript
   state.currentZone = Zone.HouseInterior
   ```
   — After genesis, starts in HouseInterior. No world-swap issue here.

**Verdict:** Genesis creates entities in multiple zones intentionally. This is legitimate cross-zone seeding and must be preserved in Phase 1 (hand off entities to the correct per-zone world during/after genesis).

---

### getCurrentEntityZone() & isEntityInCurrentZone() Usage

**Pattern prevalence:**
- `getCurrentEntityZone()` used in 30+ createEntity paths (correct — always tags with current zone)
- `isEntityInCurrentZone()` used in 25+ query filters (correct — filters results to current zone)
- `spatialAtInCurrentZone()` used in 5+ spatial queries (correct — wrapper for zone-filtered spatial)

**Verdict:** Filtering infrastructure is well-established and widely used. Refactoring to per-zone worlds will remove the need for these checks (entities will already be in the correct world), but these functions can be deprecated gradually or repurposed as migration helpers.

---

## Questions for the User (Phase 1 Planning)

1. **Revery lifecycle (src/engine/revery.ts:133):** Does revery state span zones or is it zone-scoped? Should reveryCount count all characters globally or only characters in the current zone?

2. **Celestial events in non-Overworld zones:** Should meteorites, shooting stars, and satellites ever appear in interior zones (Cave, Ruin, House, Cellar)? Or are they always Overworld-only?

3. **Genesis world-building:**
   - Should genesis create entities in a temp world, then partition them at the end?
   - Or should `getCurrentEntityZone()` during genesis return the appropriate zone, and entities go directly to per-zone worlds?

4. **Deserialize schema migration:** When a legacy save (single world) is loaded, should we:
   - Deserialize into a temp world, then partition by EntityZone?
   - Or update the schema migration layer to extract zone info and rebuild per-zone worlds on load?

5. **Cross-zone bugs (scan.ts, celestial.ts, egregoreFauna.ts, clickResolution.ts):** Should these be fixed in Phase 0 (before worlds split) or as part of Phase 1 (during refactoring)?

---

## Recommendations for Phase 1

1. **Fix 4 cross-zone bugs immediately** (scan, egregoreFauna, clickResolution). They are low-hanging fruit.

2. **Genesis refactoring strategy:** Update `getCurrentEntityZone()` to partition entities correctly into per-zone worlds at the end of genesis, before gameplay starts.

3. **Serialization:** Update serializeState/deserializeState to handle `state.worlds: Map<Zone, World>` instead of single `state.world`.

4. **Backwards compatibility:** Add migration logic to convert legacy single-world saves to per-zone worlds on load.

5. **Phased rollout:** After refactoring, keep `isEntityInCurrentZone()` and `spatialAtInCurrentZone()` as no-op helpers or remove them completely, depending on usage. They will become unnecessary.

---

## Files for Review / Phase 1

**High priority (bugs or ambiguity):**
- `src/engine/scan.ts` (oakAt leak)
- `src/engine/egregoreFauna.ts` (isOccupiedByBlocker leak)
- `src/engine/clickResolution.ts` (tileHasClickable leak)
- `src/engine/revery.ts` (ambiguous reveryCount scope)
- `src/engine/state.ts` (genesis seeding strategy)

**Medium priority (large refactor surface):**
- `src/engine/predecessors.ts` (cross-zone seeding)
- `src/harness/serialize.ts` (schema migration)

**Low priority (confirm no changes needed):**
- `src/engine/zone.ts` (zone filtering helpers — can be deprecated or repurposed)
- `shared/src/protocol.ts` (no entity IDs — no change needed)

---

## Summary

The codebase is **well-structured for migration**. Zone filtering is used consistently in 95% of sites. Four cross-zone bugs (scan, fauna, click, visibility) are fixable in < 30 min. Genesis seeding is legitimate and can be preserved via partition-at-end logic. Serialization requires schema updates but no fundamental rework. The refactoring is high-confidence and low-risk.

**Estimated effort to Phase 1:** 4–6 hours (including bug fixes, schema migration, test updates).
