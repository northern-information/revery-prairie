import type { World } from './ecs/world'
import type { CivilizationRuin, GenesisSimState, RuinGenerationMode } from './genesisTypes'
import type { EgregoreGenome, FloraGenome, TraitBag } from './genetics'
import type { ColorId } from '@revery-prairie/shared'

export const TileType = {
  Space: 'space',
  Dirt: 'dirt',
  Flora: 'flora',
  BurntFlora: 'burntFlora',
  Sand: 'sand',
  CaveFloor: 'caveFloor',
  CaveWall: 'caveWall',
  CaveBreakableWall: 'caveBreakableWall',
  CaveEntrance: 'caveEntrance',
  CaveApron: 'caveApron',
  CaveExit: 'caveExit',
  RuinFloor: 'ruinFloor',
  RuinWall: 'ruinWall',
  RuinEntrance: 'ruinEntrance',
  RuinApron: 'ruinApron',
  RuinExit: 'ruinExit',
  RuinAqueduct: 'ruinAqueduct',
  RuinAqueductBroken: 'ruinAqueductBroken',
  RuinDebris: 'ruinDebris',
  RuinDoorLocked: 'ruinDoorLocked',
  RuinDoorOpen: 'ruinDoorOpen',
  // Egregoric flora tile — inert in RP-8a (no interaction, no
  // lifecycle, walkable). The renderer draws it using a Voynich glyph
  // from EGREGORE_GLYPHS keyed by tile position. Per cosmology doctrine
  // egregores are "not-of-this-Earth" — no Latin binomial, no Flora
  // species id. Manual entries are procedurally-generated EVA token
  // pages with ~1-in-5 Latin pierces.
  Egregore: 'egregore',
  // The little house (RP-33). HouseEntrance is the single overworld
  // door tile (`α` glyph, warm brown); HouseApron the 8-neighbor path.
  // HouseFloor / HouseWall make up the interior. Fireplace is animated
  // `^~*` at FIRE_TICK_MS cadence; HouseHearth is the walkable row in
  // front of it. HouseExit is the 3-wide south door rendered in pink
  // (`#ff69b4`) per the cave/ruin exit idiom. The Revery happens in
  // place at the hearth opposite Emily across the fireplace — no
  // furniture is required to host it (v11 R7 amendment, RP-36).
  HouseEntrance: 'houseEntrance',
  HouseApron: 'houseApron',
  HouseFloor: 'houseFloor',
  HouseWall: 'houseWall',
  Fireplace: 'fireplace',
  HouseHearth: 'houseHearth',
  HouseExit: 'houseExit',
  // The yard around the little house (RP-67). HouseRoof + HouseEaves
  // render the house as seen from outside while the steward stands in
  // the yard zone. HouseDoorClosed is the closed-from-outside front
  // door — stepping on it triggers the yard→house-interior transition.
  // Fence is wooden post-and-rail (unwalkable); FenceGate is the
  // single walkable gate tile centered on the south fence — stepping
  // on it triggers the yard→overworld transition.
  HouseRoof: 'houseRoof',
  HouseEaves: 'houseEaves',
  HouseDoorClosed: 'houseDoorClosed',
  Fence: 'fence',
  FenceGate: 'fenceGate',
  // RP-69a — a weathered fence segment authored per Whine yard. Walkable
  // (unlike Fence), reads as a collapsed/broken post against the dirt-
  // family palette. Authored positions live in `WHINE_HOME_VARIANTS`
  // [N].brokenFenceSegments and are applied inside `createWhineHomeYard`.
  BrokenFence: 'brokenFence',
  // The Knot Cellar (RP-37). A narrow corridor archive accessed via a
  // bulkhead in the back yard. CellarFloor is the central 3-wide
  // corridor; CellarWall the side walls and far end; CellarAlcoveFloor
  // is the alcove tile cut into the wall at every CELLAR_ALCOVE_SPACING
  // rows, alternating left/right by alcove index parity (a Revery Knot
  // hangs here once the steward has Reveried). CellarBulkhead is the
  // yard-side hatch (pink `#ff69b4` per the cave/ruin exit idiom);
  // CellarBulkheadInterior is the cellar-side staircase that exits back
  // to the yard.
  CellarFloor: 'cellarFloor',
  CellarWall: 'cellarWall',
  CellarAlcoveFloor: 'cellarAlcoveFloor',
  CellarBulkhead: 'cellarBulkhead',
  CellarBulkheadInterior: 'cellarBulkheadInterior',
  // Whine, Haunted Village (RP-69). WhineEntrance is the overworld
  // tile that opens into the Whine zone — stamped as a 3-tall vertical
  // strip per RP-69a (rotated from the original 1×3 horizontal row).
  // WhineApron tiles surround the entrance in a 3×5 footprint and
  // also trigger entry — mirroring the cave/ruin/house apron pattern.
  WhineEntrance: 'whineEntrance',
  WhineApron: 'whineApron',
} as const

export type TileType = (typeof TileType)[keyof typeof TileType]

export interface Tile {
  type: TileType
}

export interface Position {
  x: number
  y: number
}

export interface TrailPoint {
  x: number
  y: number
  time: number
}

export interface MovementTween {
  fromX: number
  fromY: number
  startTime: number
  durationMs: number
}

// RP-64 — A waterfall: a river or pond tile (topX, topY) that drops
// over an unclimbable elevation step to a lower walkable
// neighbor (bottomX, bottomY). Frozen in winter (Autumn→Winter
// boundary flips frozen=true; Winter→Spring flips it false). When
// frozen, the bottom→top step becomes climbable per RP-41's
// isClimbableStep — _the prairie that refused you in summer
// welcomes you in winter_.
export interface Waterfall {
  topX: number
  topY: number
  bottomX: number
  bottomY: number
  frozen: boolean
}

export const ItemCategory = {
  Fauna: 'fauna',
  Flora: 'flora',
  Tool: 'tool',
  CelestialDebris: 'celestial debris',
  Gizmo: 'gizmo',
  Seed: 'seed',
  Artifact: 'artifact',
  Zoogenic: 'zoogenic',
} as const

export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory]

export interface ItemDefinition {
  id: string
  name: string
  glyph: string
  glyphColor: string
  category: ItemCategory
  // RP-15. Optional body-wear surface. Definitions that declare maxUses
  // accrue 1 / maxUses per use event; wear is read from state.itemWear
  // keyed by ItemInstance.uid. Definitions that omit it are wear-free.
  // Non-positive values are treated as wear-free by the tick site.
  maxUses?: number
}

export type ItemUid = string

export interface ItemInstance {
  uid: ItemUid
  definitionId: string
  gridX: number
  gridY: number
}

export interface Container {
  id: string
  name: string
  width: number
  height: number
  items: ItemInstance[]
}

export interface DriftBehavior {
  type: 'drift'
  moveChance: number // probability per tick (0.15 for ghosts)
  freezeOnDialog: boolean
  // RP-69 — optional rectangular constraint applied before terrain
  // and crater filters in tickDrift. When present, candidate
  // destination tiles outside the inclusive rectangle are rejected.
  // Whine ghosts use this to stay in the corridor in front of their
  // assigned home; overworld ghosts omit it for unbounded drift.
  bounds?: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
}

export interface FollowBehavior {
  type: 'follow'
}

export type CharacterBehavior = DriftBehavior | FollowBehavior

// Time-lapse camera (precis #23). A camera placed on a tile records
// "photographs" of changes inside its 3x3 footprint. Each photograph
// captures the {char, color} of the 9 cells at the moment a change
// stabilizes (v11 R4 diff-driven capture), plus a timestamp. Film
// count is the only wear surface; the body itself is eternal but
// unreloadable.
export interface TimeLapseCell {
  char: string
  color: string
}

export interface TimeLapseFrame {
  recordedAt: number
  // Row-major 3x3 snapshot: NW, N, NE, W, C, E, SW, S, SE.
  cells: TimeLapseCell[]
}

export interface PlacedCamera {
  // ItemInstance uid of the camera. Survives placement/pickup so
  // state.cameraFilm and state.cameraArchive can key on it.
  uid: string
  x: number
  y: number
  zone: Zone
  ruinIndex?: number
  startedAt: number
  // startedAt + (SEASONAL_PHASE_PERIOD_MS / 4). Recording is frozen once
  // now >= expiresAt even if film remains.
  expiresAt: number
  frames: TimeLapseFrame[]
  // v11 R4 — diff-stability filter buffer. Transient, non-persistent.
  // captureIfChanged sets these when the live cells diverge from the
  // last committed frame; once `pendingCount` reaches
  // STABILITY_THRESHOLD_TICKS, the candidate commits and both fields
  // reset. Not serialized — save/load roundtrips drop them.
  pendingCells?: TimeLapseCell[]
  pendingCount?: number
  // RP-24 — seeded predecessor steward whose tenure this camera
  // outlived. Absent for current-tenure cameras (the inherited Field
  // Camera seeded by RP-23 and any cameras the player has placed
  // themselves). Set only by seedPredecessorCameras at genesis time;
  // discarded on pickup so re-placement creates an ordinary camera.
  predecessor?: PredecessorRecord
}

// RP-70 — a placed Geodetic Marker. The steward drops a marker to claim
// a location; its world position surfaces on the map permacomputer tab.
// uid is the geodeticMarker ItemInstance uid, preserved across the
// place / pickup cycle so re-placement keeps identity. label is GM-N
// where N is the lowest free index in 1..10 at placement time —
// retrieval frees the number for reuse. zone records where it was
// placed; the map projects every marker at its stored x,y.
export interface PlacedMarker {
  uid: ItemUid
  x: number
  y: number
  zone: Zone
  label: string
}

// RP-24 — discriminated union for where a predecessor's tenure ended.
// 'bed' means the steward closed out at the little house (RP-33);
// { kind: 'field', tile } means they collapsed on the overworld at
// the stored tile. The fate is metadata only — it never surfaces in
// the playback header (the header uses gift|memorial from the camera's
// residual film count). Reserved for RP-37 / RP-40 to consume later.
export type PredecessorFate = 'bed' | { kind: 'field'; tile: Position }

// RP-24 — one predecessor steward record attached to a seeded
// PlacedCamera. tenure is a positive integer ≥ 1, where 1 is the
// most-recent predecessor and increasing values are older.
export interface PredecessorRecord {
  stewardName: string
  tenure: number
  fate: PredecessorFate
}

export const MainQuestPhase = {
  AwaitingCoyote: 'awaiting-coyote',
  Gathering: 'gathering',
  Sealed: 'sealed',
} as const

export type MainQuestPhase = (typeof MainQuestPhase)[keyof typeof MainQuestPhase]

export interface CharacterDefinition {
  id: string
  name: string
  title?: string
  glyph: string
  glyphColor: string
  dialog: string[]
  music?: string
  gift?: { kind: 'item'; id: string }
  postGiftDialog?: string[]
  postGift?: { kind: 'item'; id: string }
}

export interface TransitionFade {
  startTime: number
  duration: number
}

export interface BootTitleCard {
  startTime: number
  label: string
}

export type ZoneTransitionDirection = 'enter' | 'exit'
export type ZoneTransitionKind =
  | 'cave'
  | 'ruin'
  | 'house'
  | 'yard'
  | 'house-to-yard'
  | 'knot-cellar'
  | 'whine'
  | 'whine-home'

export interface ZoneTransition {
  startTime: number
  duration: number
  direction: ZoneTransitionDirection
  kind: ZoneTransitionKind
  // Tile-space origin for the iris circle. For 'enter', this is the
  // entrance tile in the source (overworld) map; for 'exit', this is
  // the exit tile in the source (interior) map.
  irisCenter: Position
  // Set when kind === 'ruin' and direction === 'enter'. Identifies
  // which ruin interior to swap into at midpoint.
  ruinIndex: number | null
  // Whether the deferred map swap has fired yet. Flipped to true the
  // first frame progress crosses 0.5.
  swapApplied: boolean
}

// Armed when the player exits a structure (cave / ruin / house). While
// set, checkTransition suppresses the enter transition for this one
// overworld entrance so a disoriented player dropped just outside can't
// immediately step back in. Cleared once the player walks
// STRUCTURE_REENTRY_REARM_DISTANCE Chebyshev tiles away. A plain object
// (no Maps/Sets/functions) so it round-trips through serialization.
export interface ReentryLock {
  // The overworld entrance tile the player just emerged from.
  entrance: Position
}

export type MultiplayerStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface MultiplayerSession {
  prairieId: string
  ownerToken: string | null
  sessionId: string | null
  stewardName: string
  color: ColorId
  role: 'host' | 'visitor'
  status: MultiplayerStatus
}

export interface RemotePlayer {
  sessionId: string
  stewardName: string
  color: ColorId
  x: number
  y: number
  facing: Direction
  lastUpdateMs: number
}

// ─── RP-6 — naturalist's manual scan ────────────────────────────────────

// Discriminated by `kind`. Flora and oak scans share the same hold-to-scan
// flow but resolve different identities on commit:
//   - flora: identity comes from the floraLifecycle entry for the targeted tile
//   - oak: identity comes from the OakData component on the targeted oak entity
export type ScanProgress =
  | {
      kind: 'flora'
      target: Position
      species: FloraSpecies
      startTime: number
    }
  | {
      kind: 'oak'
      target: Position
      startTime: number
    }
  | {
      kind: 'egregore'
      target: Position
      startTime: number
    }

// One scanned specimen — what the naturalist's manual stores per scan.
// Identity uniquely identifies the plant (the SHA256 from #3); time and
// position are recorded for the manual's card display ("scanned 2 minutes
// ago" / coordinates). Scans of the same identity (same plant) are
// deduped at the commitScan call site.
export interface ScannedSpecimen {
  identity: string
  scannedAt: number
  position: Position
}

// ─── flora pollen ─────────────────────────────────────────────────────────────

export interface PollenParticle {
  x: number
  y: number
  age: number
  maxAge: number
  profileId: string
}

export interface FloraPollinateProfile {
  glyph: string
  color: string
  parsedColor: [number, number, number]
  windThreshold: number
  emitRate: number
  minAge: number
  maxAge: number
  emitGate?: (state: GameState, tx: number, ty: number) => boolean
}

// ─── wind system ─────────────────────────────────────────────────────────────

export type GustPhase = 'none' | 'attack' | 'hold' | 'decay'

export interface WindState {
  initialized: boolean
  smoothSx: number
  smoothSy: number
  smoothSpeed: number
  phaseAccum: number
  gustPhase: GustPhase
  gustPhaseStart: number
  gustPhaseDuration: number
  gustIntensity: number
  gustPeakIntensity: number
  gustSx: number
  gustSy: number
}

export interface WindSample {
  sx: number
  sy: number
  speed: number
  gustSx: number
  gustSy: number
  gustIntensity: number
  totalSx: number
  totalSy: number
  totalSpeed: number
  phaseAccum: number
}

export interface GameState {
  stewardName: string
  map: Tile[][]
  mapWidth: number
  mapHeight: number
  player: Position
  backpack: Container
  playerFacing: Direction
  facingEntityPos: Position | null
  camera: Position
  viewportWidth: number
  viewportHeight: number
  // RP-63 — discriminated union on speakerKind. Character speakers are
  // named persons (Gron, Moab, Coyote, Emily, ghosts); Interactable
  // speakers are tile-anchored or system-synthetic (gate today). The
  // characterId/interactableId branch carries the speaker reference;
  // the rest of the fields are identical across both variants.
  activeDialog:
    | {
        speakerKind: 'character'
        characterId: string
        lineIndex: number
        typingIndex: number
        typingDone: boolean
        transitioning: boolean
        transitionStartTime: number
        awaitingConfirmation?: boolean
      }
    | {
        speakerKind: 'interactable'
        interactableId: string
        lineIndex: number
        typingIndex: number
        typingDone: boolean
        transitioning: boolean
        transitionStartTime: number
      }
    | null
  discoveredRecipes: Set<string>
  previewFn:
    | ((state: GameState, time: number) => { pos: Position; char: string; color: string; isValid: boolean }[])
    | null
  weather: Weather
  path: Position[] | null
  pathWaypoints: Position[]
  // True when the path was committed via shift+right-click (single or chained).
  // The renderer gates the projected-path overlay on this flag — plain
  // right-click moves still walk the player but render no glyphs.
  pathIsChained: boolean
  pendingAction: (() => void) | null
  pendingInteractionTarget: Position | null
  heldDirection: Direction | null
  sprinting: boolean
  trail: TrailPoint[]
  playerTween: MovementTween | null
  cursorTile: Position | null
  cursorScreenPos: { x: number; y: number } | null
  rainSeed: number
  metric: boolean
  audioEnabled: boolean
  fontScale: number
  heldKeys: Set<ScreenAxisKey>
  currentZone: Zone
  overworldMap: Tile[][]
  overworldMapWidth: number
  overworldMapHeight: number
  caveMap: Tile[][]
  caveMapWidth: number
  caveMapHeight: number
  caveEntranceOverworld: Position
  caveEntranceInterior: Position
  caveRevealed: boolean
  caveHiddenPositions: Set<string>
  caveNpcSpot: Position
  caveBreakableWallPositions: Position[]
  // Little house interior (RP-33). Deterministic 30x18 buffer
  // built by createHouseInterior(); enterHouse / exitHouse swap state.map
  // to/from this pointer just like the cave pair.
  houseMap: Tile[][]
  houseMapWidth: number
  houseMapHeight: number
  // Overworld door tile (the `α` glyph), placed west of Gron at genesis.
  houseEntranceOverworld: Position
  // Interior spawn position — the hearth tile east of the fireplace,
  // opposite Emily across the fire. Also the Revery anchor: the steward
  // Reverys in place here, no bed teleport (v11 R7 amendment, RP-36).
  houseEntranceInterior: Position
  // RP-67 — interior position the steward arrives at when walking
  // through the front door (the HouseDoorClosed tile in the yard).
  // Distinct from houseEntranceInterior (the hearth-spawn for tenure
  // start and Revery anchor) — this one sits one tile north of the
  // HouseExit row so the player faces into the room from the door.
  houseDoorInteriorEntry: Position
  // RP-69 — threshold-zone registry. The substrate underneath
  // Zone.LittleHouseYard (RP-67), Zone.WhineVillage and the twelve
  // Zone.WhineHomeYard instances (RP-69), and any future bounded place
  // that sits between the prairie and an interior. Each entry owns its
  // own map, dims, gate bindings, return tile, pause flag, and any
  // per-zone state (the little house yard uses `flora` for its sampled
  // snapshot). v11 R8 named the singleton yard fields; v11 R9 folded
  // the substrate generalization into RP-69 once Whine required twelve
  // nested instances.
  thresholdZones: Map<ZoneId, ThresholdZoneState>
  // Overworld tile that opens into Whine, Haunted Village. Null if
  // genesis exhausted its placement ring without finding a valid
  // 3x3 Dirt footprint east of the little house — Whine is still
  // registered but unreachable for the tenure.
  whineEntranceOverworld: Position | null
  // Knot Cellar (RP-37). The cellar is a long narrow corridor with
  // alcoves cut into the side walls at every CELLAR_ALCOVE_SPACING
  // rows, alternating left/right by index parity. Built once at
  // genesis by createKnotCellar() in cellar.ts; persists for the
  // tenure. cellarDoorSpawn is where the steward arrives via the
  // bulkhead from the yard; cellarBulkheadInterior is the in-cellar
  // staircase that exits back to the yard; cellarBulkheadYard is the
  // mutated yard tile (one north of the house's back wall, x-centered)
  // that triggers cellar entry. The yard map itself lives inside
  // state.thresholdZones (RP-69 migration); the bulkhead is stamped
  // into that map at genesis before the yard is registered.
  cellarMap: Tile[][]
  cellarMapWidth: number
  cellarMapHeight: number
  cellarDoorSpawn: Position
  cellarBulkheadInterior: Position
  cellarBulkheadYard: Position
  // RP-37 — current number of alcoves carved into the cellar. Starts at
  // CELLAR_INITIAL_ROOM_COUNT (256) and doubles each time
  // archivedKnots.length would exceed it. The cellar grows
  // indefinitely; ensureCellarCapacity is the only writer.
  cellarRoomCount: number
  // RP-37 — fog-of-war discovery set for the Knot Cellar. Mirrors
  // state.caveFogExplored / state.overworldFogExplored / per-ruin
  // fogExplored. Permanent discovery (RP-62 "fog returns to memory"):
  // tiles enter this set the first time they fall in the steward's
  // FOV and stay forever, so the corridor reads as remembered the
  // moment the steward looks away.
  cellarFogExplored: Set<string>
  // Emily's invitation state machine. 'unoffered' at genesis; flips to
  // 'offered' when her autumn last line arms awaitingConfirmation;
  // 'confirmed' on [f]-consume; resets to 'unoffered' at dialog close
  // without confirm or at Revery Closing.
  emilyInvitation: 'unoffered' | 'offered' | 'confirmed'
  // RP-34 — one-shot latch for the first-wake dialog. False on a
  // fresh GameState; flipped to true on the first eligible gameplay
  // frame when firstWakeTrigger auto-opens Emily's dialog. Persists
  // across save/load so re-opening a save does not re-trigger.
  tenureOpened: boolean
  giftsReceived: Set<string>
  world: World
  // RP-17 — per-species growth-preview queues. Each species owns
  // its own pending-preview Set so wildflower previews don't commit as
  // clover tiles and vice versa. Use helpers in floraGrowthPreviews.ts
  // — addGrowthPreview, hasAnyGrowthPreview, clearAllGrowthPreviews,
  // getGrowthPreviewSet — rather than touching the Map directly from
  // call sites that don't care about species.
  floraGrowthPreviews: Map<FloraSpecies, Set<string>>
  floraLifecycle: Map<string, FloraLifecycleState>
  // RP-17 — active ceremony waves awaiting tickFloraWaves.
  // Plain JSON-serializable. No Entity refs — the wave is bound to a
  // seedIdentity (lineage source) rather than the bee that cast it.
  activeWaves: WaveEmission[]
  // RP-17 — current overlay rendering mode. Cycled by the [1]/[2]/[3]
  // keybinds in useKeyboard.ts. Default at game start: OverlayMode.Default.
  overlayMode: OverlayMode
  // Egregoric flora tile positions (RP-8a). Genesis places ~3
  // inert TileType.Egregore tiles biased near craters; this list lets
  // the manual entry generator and the sidebar identify them without
  // a full map scan. Stable across reloads for the same steward name.
  egregorePositions: Position[]
  // Per-tile activity state for the egregoric biome (RP-8b). Keyed
  // by posKey(x, y); one entry per position in egregorePositions. Stage
  // is inverse-phased to native flora — Active in Winter, Dormant
  // otherwise. Species and genome are deterministic per (steward,
  // position); see src/engine/egregore/species.ts and
  // src/engine/genetics/egregore.ts.
  egregoreLifecycle: Map<string, EgregoreActivityState>
  // Tracks the most recent in-game year that tickEgregoreSpread placed
  // tiles, throttling stewardship-winter drift to ~1–2 tiles per year.
  // Initialized to -1 so the first eligible tick can fire. Independent
  // of Revery-time advances, which are not throttled by this field.
  lastEgregoreSpreadYear: number
  // RP-18 — placed meteorites (stone circles). Multi-spawner,
  // single lifecycle: dropItem appends when a meteorite is dropped from
  // inventory; pickUpFacingOrStandingPlacedMeteorite splices on F-tap.
  // The stoneCircles render pass, egregore spread containment filter,
  // and the stone-circle manual discovery hook all read this array.
  placedMeteorites: Position[]
  // RP-18 — tile the cursor is hovering on while an inventory drag
  // is over the canvas. The stoneCircles render pass draws a pink cell
  // highlight on this tile so the steward sees where the drop will
  // land. Owner: useCanvasDrop (mousemove writes, cancel/drop clears).
  dragHoverTile: Position | null
  soilHealth: Map<string, number>
  elevation: Map<string, number>
  // RP-41 — spawn-connected tiles reachable through climbable
  // elevation steps. Tiles outside this set are visible-but-
  // unwalkable (isolated mesas, escarpments). Single-owner write
  // at state construction; future RP-44 winter geology recomputes
  // when elevation mutates. _The prairie does not owe the steward
  // access._
  reachableMass: Set<string>
  // RP-64 — water tiles (river or pond) that drop over an
  // unclimbable step to a lower walkable neighbor. Keyed by
  // posKey of the upper-edge water tile. Frozen flag flips at
  // season boundaries (Autumn↔Winter). In winter, a frozen
  // waterfall's bottom→top transition is climbable (upward
  // only, asymmetric) — see isClimbableStep in position.ts.
  // _The prairie has gravity now._ (v11 R5, 2026-05-30)
  waterfalls: Map<string, Waterfall>
  ponds: Set<string>
  rivers: Set<string>
  tileWater: Map<string, number>
  burnScars: Set<string>
  craters: Set<string>
  meteorShower: MeteorShowerState
  lastSatelliteSpawnTime: number
  screenShakeUntil: number
  lightning: LightningState
  manualDiscoveries: Set<string>
  manualState: ManualState
  lastDialogTypingTick: number
  glintingCoins: Set<string>
  coinGlintPopTimes: Map<string, number>
  seedGenomes: Map<string, FloraGenome>
  // RP-59 — uid of the item currently in hand (placement-ready), or null.
  // Single-owner writes via src/engine/inHand.ts. uid-keyed so it survives
  // autoSort/merge/split like glintingCoins. The ItemInstance stays in the
  // backpack — in-hand is a reference, never a move out of the container.
  equippedItemUid: ItemUid | null
  divinedHexagrams: Set<number>
  glintZones: Set<string>
  glintPatches: GlintPatch[]
  glintOpacity: Map<string, number>
  lastGlintSpawnTime: number
  civilizationRuins: CivilizationRuin[]
  mainQuestPhase: MainQuestPhase
  ruinGenerationMode: RuinGenerationMode
  deepTime: DeepTimeState | null
  deepTimeTransition: TransitionFade | null
  // RP-4 — the Revery (long-form ceremonial phase).
  revery: ReveryState | null
  // Lifetime count of completed Reveries. Increments on Closing → null.
  reveryCount: number
  // Wall-clock time of the last Revery's Closing. Used by REVERY_COOLDOWN_MS
  // gating in tickDormancyPressure so back-to-back Reveries can't fire within
  // one year.
  lastReveryEndTime: number
  // Monotonic accumulator of cosmological drift (v3 doctrine). 0 baseline in
  // this PR; future features wire passive transmission (v3 layer (a)) and
  // meteorite-placement (v3 layer (c)) increments.
  cosmologicalDrift: number
  // Per-species list of revealed phenotype labels. Each Revery resolves one
  // (species, axis) pair via resolvePhenotypeLabel. Re-resolving the same
  // pair OVERWRITES — no duplicates per (species, axis).
  revealedPhenotypes: Map<FloraSpecies, RevealedPhenotype[]>
  // RP-32 — dormancy pressure (forcing function). Domain [0, 1].
  // Climbs across autumn via the linear ramp in tickDormancyPressure;
  // crossing 1.0 schedules the Revery via initiateRevery. Resets to 0 at
  // Revery Closing and on Autumn → Winter without a Revery.
  dormancyPressure: number
  // RP-32 — steward's tile at the moment a summons Revery began.
  // Set at the Omen → Observing transition when state.revery.summons is
  // true; cleared at Closing. Downstream render passes may read this to
  // apply a dormant-flora wash to the collapsed tile.
  collapsedStewardTile: Position | null
  // Wall-clock time of the player's last successful movePlayer. Updated
  // by movement.ts. Was used by the retired cloud-passing omen (RP-4
  // / RP-32); retained for any future use.
  playerStationarySince: number
  postGiftActionsCompleted: Set<string>
  rainFrontOffset: number
  precipitationIntensity: number
  // Fractional position in the annual cycle, [0, 1). Advances only in the
  // overworld; phase 0 = spring equinox (March 20, game start),
  // 0.25 = summer solstice, 0.5 = autumn equinox, 0.75 = winter solstice.
  // Drives seasonal temperature bias and dormancy.
  seasonalPhase: number
  // Gregorian month/day projection of seasonalPhase, anchored at the spring
  // equinox (day-of-year 79). Recomputed in tickWeather; single writer.
  currentDate: { month: number; day: number }
  // RP-9b — Torchbearer behavior pass.
  // lockedBurnLine: the line Moab walks this Spring. The authoring layer
  //   (burnDrawMode + burnLineDraft) was removed in the input-system-
  //   cleanup CR; this field is dormant pending the walk-with-Moab
  //   follow-up that will repopulate it.
  // burnLineIndex: Moab's progress along lockedBurnLine. null when idle.
  // lastSeenSeason: the previous tick's weather.season. Drives transition
  //   detection (Winter → Spring lock, Spring → Summer cleanup).
  // moabState: see MoabState. Tracks Moab's role in the burn cycle.
  lockedBurnLine: Position[] | null
  burnLineIndex: number | null
  lastSeenSeason: Season
  moabState: MoabState
  wind: WindState
  pollen: PollenParticle[]
  pollenTrailDepth: number
  waterProximity: Map<string, number>
  genesis: GenesisSimState | null
  bootTitleCard: BootTitleCard | null
  zoneTransition: ZoneTransition | null
  // Re-entry lock armed on structure exit. See ReentryLock.
  reentryLock: ReentryLock | null
  nextAngelSpawnTime: number
  angelFlashTime: number
  coyoteCargo: string | null
  ruinInteriors: RuinInterior[]
  currentRuinIndex: number | null
  // RP-62 — fog of war "returns to memory". A tile is `visible` (in
  // gaze), `remembered` (ever seen, now dim memory), or `unexplored`.
  // fogExplored is the single "ever seen" set that drives `remembered`;
  // there is no permanently-bright tier. floraMemory holds the last
  // appearance of each flora/egregore tile seen while it was visible,
  // so remembered flora renders frozen at last-known state rather than
  // live. Player-facing vocabulary is gaze / memory / unseen.
  caveFogExplored: Set<string>
  caveFloraMemory: Map<string, FloraMemoryEntry>
  overworldFogExplored: Set<string>
  overworldFloraMemory: Map<string, FloraMemoryEntry>
  autoHidePanels: boolean
  panelOpenMoveCount: number
  multiplayerSession: MultiplayerSession | null
  remotePlayers: Map<string, RemotePlayer>
  // RP-6 — naturalist's manual scan-to-discover.
  // scannedSpecimens maps each flora species to an ordered list of
  // specimens the player has scanned, oldest first. Duplicates (same
  // identity) are deduped at commit time. The manual entry renders a
  // card stack with paging, one card per specimen.
  scannedSpecimens: Map<FloraSpecies, ScannedSpecimen[]>
  // Oak scans live in their own array (oaks aren't flora so they don't have
  // a FloraSpecies key). Same dedupe-by-identity rule applies.
  oakSpecimens: ScannedSpecimen[]
  // Egregore tile scans (RP-8a). Egregores have no FloraSpecies key
  // — they are not-of-this-Earth. One ScannedSpecimen per scanned tile,
  // deduped on identity (a tileHash-derived hex string).
  egregoreSpecimens: ScannedSpecimen[]
  // Active scan state. Non-null while [f] is held and a valid target was
  // found at keydown. Cleared on commit, early release, movement, or any
  // other abort condition.
  scanInProgress: ScanProgress | null
  // The manual entry id (e.g. "flora:clover") that the manual should
  // scroll to and highlight on its next render. Set by the scan keyup
  // handler after a successful commit; cleared by ManualPanel once it has
  // scrolled to the entry. Outside of scan flow, always null.
  manualHighlightEntryId: string | null
  onPlayerMoved: (() => void) | null
  onGenesisComplete: ((handoffTime: number) => void) | null
  // Time-lapse camera (precis #23). filmRemaining keyed by camera uid;
  // cameras without an entry are unloaded. placedCameras list each
  // camera entity placed in the world. cameraArchive accumulates
  // frames across placement/pickup cycles. playbackCameraUid is the
  // uid of the camera currently shown in the TimeLapsePlayback modal,
  // or null when no modal is open.
  cameraFilm: Map<string, number>
  placedCameras: PlacedCamera[]
  // RP-70 — Geodetic Markers the steward has placed in the world. Read
  // at consult-time by the map permacomputer tab; single writer is the
  // geodeticMarker PlaceableSpec (place) and the marker retrieval path
  // in interaction.ts (pickup). Marks follow no entity lifecycle beyond
  // their own place/pickup.
  placedMarkers: PlacedMarker[]
  cameraArchive: Map<string, TimeLapseFrame[]>
  playbackCameraUid: string | null
  // RP-15. Body-wear values in [0, 1] keyed by ItemInstance.uid.
  // Single writer: archivePlacedCameraFrames in timeLapse.ts.
  // Readers: camera PlaceableSpec, ItemInfo, InHandSlot. Missing
  // entries are treated as 0. The uid is stable across the camera's
  // destroy-on-place / recreate-on-pickup cycle, so wear survives the
  // round trip without explicit copy.
  itemWear: Record<ItemUid, number>
  // Precis #53 (v9 thinktank R3). Chronological photograph album.
  // Frames migrate here from cameraArchive[uid] + placedCameras[i].
  // frames whenever the TimeLapsePlayback modal dismisses. Persists
  // across tenures. The camera is the lens; the album is the keeping.
  photographAlbum: TimeLapseFrame[]
  // RP-22 — named regions detected at genesis time. Single writer:
  // detectNamedRegions in regions.ts, called once from createGameState.
  // Stable for the lifetime of the tenure; never mutated afterward.
  namedRegions: NamedRegion[]
  // RP-22 — chronicle events emitted by world-state transitions. Append-only
  // within a tenure. Single writer: addChronicleEvent in chronicle/index.ts,
  // which enforces dedupe-by-id. Reset to [] on a new tenure.
  chronicle: ChronicleEvent[]
  // RP-36 — Revery Knot. Ten fields land together; see docs/claude/state.md
  // for single-owner write conventions. _The item is the omen. The omen is
  // the item._
  knotDelivery: KnotDeliveryState | null
  bedKnotPresent: boolean
  archivedKnots: ArchivedKnot[]
  lastKnotDeliveryArmed: boolean
  lastKnotPickupAt: number
  lastKnotPickupTile: Position | null
  lastKnotPickupHarvestYear: number
  lastArchiveReveryCount: number
  knotHarvestYearCounter: number
  knotHarvestYears: Map<ItemUid, number>
}

// RP-36 — scripted coyote-delivery route. Armed at Summer → Autumn,
// cleared when the Knot reaches the steward (or the bag fallback drops
// it as a ground item near Gron).
export interface KnotDeliveryState {
  stage: 'walkingToHouse' | 'enroute'
  dispatchedAt: number
  harvestYear: number
}

// RP-36 — archive entry written at the Winter → Spring edge after a
// Revery. RP-37 (the root cellar) reads this array when it ships.
export interface ArchivedKnot {
  pickedUpAt: number
  pickedUpTile: Position
  archivedAt: number
  harvestYear: number
}

export const FloraStage = {
  Healthy: 'healthy',
  Brown: 'brown',
  BlinkingRed: 'blinkingRed',
  Black: 'black',
  Decomposing: 'decomposing',
  BurntRecovering: 'burntRecovering',
  // Winter pause stage (RP-2). Set when state.weather.season is Winter.
  // Dormant tiles are not subject to drying/stress death and do not advance.
  // Cleared back to Healthy when the season is no longer Winter.
  Dormant: 'dormant',
} as const

export type FloraStage = (typeof FloraStage)[keyof typeof FloraStage]

export const FloraSpecies = {
  Clover: 'clover',
  Wildflower: 'wildflower',
  TallGrass: 'tallGrass',
} as const

export type FloraSpecies = (typeof FloraSpecies)[keyof typeof FloraSpecies]

export interface FloraLifecycleState {
  stage: FloraStage
  stageStartTime: number
  hasLight: boolean
  species: FloraSpecies
  // RP-3 — SHA256 identity + trait bag. Stable per plant across
  // its lifecycle (preserved through BurntRecovering, lost when the entry
  // is deleted after the dying chain). All construction sites route
  // through createFloraLifecycleEntry in floraLifecycle.ts.
  identity: string
  traits: TraitBag
  // RP-17 — bee-mediated pollination. When a bee/monarch with a
  // matching-species pollen load (different identity) enters this tile,
  // the tile is "primed" for a cross. On the next autonomous spread,
  // the child's traits are computed via crossTraitBags(this.traits,
  // primedPollen.traits, rng) and primedPollen is cleared. Father =
  // pollen load, mother = this tile. Most-recent matching load wins.
  primedPollen?: PollenLoad
  // RP-17 — set on flora tiles that sprouted from a primed cross.
  // Records the first 8 hex chars of the donor (father) lineage at
  // cross time so the family-tree overlay can draw a second dashed
  // edge to the donor's lineage prefix index.
  crossDonorPrefix?: string
  // RP-17 — set on flora tiles that sprouted via the spread engine
  // (or the ceremony wave). Records the first 8 hex chars of the parent
  // (mother) lineage at sprout time so the family-tree overlay can
  // draw a solid edge to the parent without having to reverse the SHA
  // derivation. Genesis-placed flora and orphaned previews leave this
  // undefined.
  parentPrefix?: string
  // RP-19 — tracks whether the per-plant soil spawn-effect hook has
  // fired for this entry. Required (no `?`) so every construction site
  // decides explicitly. Defaults to false via createFloraLifecycleEntry;
  // postProcessMultiSpeciesFlora overrides to true so genesis-seeded
  // flora doesn't re-tax soil that genesis already derived for them.
  soilEffectApplied: boolean
}

// RP-17 — bee-mediated pollination. A single load carried by a
// bee/monarch in its PollenBag component (registered in ecs/types.ts).
// Cross-species mixing is allowed in the bag; the cross-prime rule only
// fires when a load's species matches the visited tile's species.
export interface PollenLoad {
  identity: string
  traits: TraitBag
  species: FloraSpecies
}

// RP-17 — ceremony wave. Emitted by the bee+clover combine and
// advanced by tickFloraWaves in src/engine/floraWaves.ts. The wave
// paints valid Dirt tiles in a cellNoise-jittered annulus expanding
// from (cx, cy) until currentRadius > maxRadius with zero new tiles
// painted in a tick. seedIdentity is the ceremony-event identity all
// painted tiles inherit as their lineage parent.
export interface WaveEmission {
  seedIdentity: string
  cx: number
  cy: number
  currentRadius: number
  maxRadius: number
  lastTickTime: number
}

// RP-17 — overlay view mode cycled by the [1]/[2]/[3] keybinds.
// Default: standard rendering. FamilyTree: lineage overlay (gated by
// per-species sequencing). RootMycelium: reserved for a future backlog item;
// the [3] keybind currently shows a "not yet" toast and does not
// change mode.
export const OverlayMode = {
  Default: 'default',
  FamilyTree: 'familyTree',
  RootMycelium: 'rootMycelium',
} as const

export type OverlayMode = (typeof OverlayMode)[keyof typeof OverlayMode]

// --- RP-8b — Egregoric flora (mechanical biome) ---

// Parallel species set under TileType.Egregore. Distinct from
// FloraSpecies (which is for native flora under TileType.Flora) — the
// cosmological boundary is rendered as a separate type, not a new enum
// branch. Two species share the tile type with distinct trait biases.
export const EgregoreSpecies = {
  Allelopath: 'allelopath',
  Spreader: 'spreader',
} as const

export type EgregoreSpecies = (typeof EgregoreSpecies)[keyof typeof EgregoreSpecies]

// Inverse-phased to native FloraStage.Dormant — egregores Activate in
// Winter and lie Dormant in other seasons.
export const EgregoreActivityStage = {
  Active: 'active',
  Dormant: 'dormant',
} as const

export type EgregoreActivityStage = (typeof EgregoreActivityStage)[keyof typeof EgregoreActivityStage]

export interface EgregoreActivityState {
  stage: EgregoreActivityStage
  stageStartTime: number
  species: EgregoreSpecies
  genome: EgregoreGenome
}

export interface ManualState {
  activeCategory: string | null
  searchQuery: string
  revealedHints: Set<string>
}

export const Sky = {
  Sun: 'sun',
  Cloudy: 'cloudy',
  Rain: 'rain',
  Snow: 'snow',
} as const

export type Sky = (typeof Sky)[keyof typeof Sky]

// Wind direction in the rotated cardinal frame. The diamond is the world
// (backlog-thinktank-v5 round 1) — iso is not a viewing layer applied to a
// flat grid; iso is the world's shape. Cardinals point at the diamond's
// tips on screen; ordinals align with the storage axes.
//
//   N  → top tip of the diamond on screen (storage direction: (-x, -y))
//   E  → right tip of the diamond on screen (storage direction: (+x, -y))
//   S  → bottom tip of the diamond on screen (storage direction: (+x, +y))
//   W  → left tip of the diamond on screen (storage direction: (-x, +y))
//   NE → down storage-+x edge (right-upper edge of the diamond on screen)
//   SE → down storage-+y edge (left-upper edge of the diamond on screen)
//   SW → up storage-+x edge (right-lower edge of the diamond on screen)
//   NW → up storage-+y edge (left-lower edge of the diamond on screen)
//
// This file is the canonical source of truth for the rotated frame. The
// compass points at the world the steward inhabits, not at the grid the
// storage uses. No coordinate translation lives anywhere in the game.
export const WindDirection = {
  N: 'N',
  NE: 'NE',
  E: 'E',
  SE: 'SE',
  S: 'S',
  SW: 'SW',
  W: 'W',
  NW: 'NW',
} as const

export type WindDirection = (typeof WindDirection)[keyof typeof WindDirection]

export const Season = {
  Spring: 'spring',
  Summer: 'summer',
  Autumn: 'autumn',
  Winter: 'winter',
} as const

export type Season = (typeof Season)[keyof typeof Season]

// RP-9b — Moab the Torchbearer's lifecycle states. 'idle' is the
// default (Moab in cave, not active). 'walking' is set during Spring
// when he is pacing lockedBurnLine and igniting tiles. 'refusing' is
// the one-tick window after a catastrophic-edge check fails. 'dismissed'
// is set when the player completes the dismiss dialog mid-walk.
// 'returning' is set after walk completion, dismissal, or refusal —
// Moab is pathfinding back to the cave.
export const MoabState = {
  Idle: 'idle',
  Walking: 'walking',
  Refusing: 'refusing',
  Dismissed: 'dismissed',
  Returning: 'returning',
} as const

export type MoabState = (typeof MoabState)[keyof typeof MoabState]

export interface Weather {
  sky: Sky
  temperatureF: number
  windSpeed: number
  windDirection: WindDirection
  humidity: number
  season: Season
}

export type Direction = 'up' | 'down' | 'left' | 'right' | 'upLeft' | 'upRight' | 'downLeft' | 'downRight'

export const isDiagonalDirection = (dir: Direction): boolean =>
  dir === 'upLeft' || dir === 'upRight' || dir === 'downLeft' || dir === 'downRight'

/** Screen-axis key (the four WASD/arrow directions in screen-relative terms). */
export type ScreenAxisKey = 'up' | 'down' | 'left' | 'right'

/**
 * Collapse an 8-way facing to a 4-cardinal direction. Used for wire
 * protocols (multiplayer) and any code path that predates diagonals.
 */
export type CardinalDirection = 'up' | 'down' | 'left' | 'right'
export const collapseFacingToCardinal = (dir: Direction): CardinalDirection => {
  switch (dir) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return dir
    case 'upLeft':
    case 'upRight':
      return 'up'
    case 'downLeft':
    case 'downRight':
      return 'down'
  }
}

export const Zone = {
  Overworld: 'overworld',
  Cave: 'cave',
  Ruin: 'ruin',
  HouseInterior: 'houseInterior',
  LittleHouseYard: 'littleHouseYard',
  KnotCellar: 'knotCellar',
  WhineVillage: 'whineVillage',
  WhineHomeYard: 'whineHomeYard',
} as const

export type Zone = (typeof Zone)[keyof typeof Zone]

// RP-69 — threshold-zone registry types. A ZoneId is a string key the
// registry uses to look up a ThresholdZoneState. Multiple ZoneIds may
// share a Zone variant (e.g. all twelve 'whine-home-NN' ids map to
// Zone.WhineHomeYard).
export type ZoneId = string

// One gate tile inside a threshold zone. Keyed in the registry entry's
// `gatePositions` map by posKey(x, y) of the FenceGate (or, for the
// little house yard, the HouseDoorClosed tile that opens the front
// door). The transition handlers look up the binding at the moment of
// the step.
export interface GateBinding {
  // 'enter' — stepping on this tile opens another zone (the target).
  // 'exit'  — stepping on this tile leaves the current zone.
  kind: 'enter' | 'exit'
  // For 'enter' bindings: the destination zone id (a ThresholdZoneState
  // key). For 'exit' bindings: omitted unless the destination is also a
  // threshold zone.
  targetZoneId?: ZoneId
  // For 'exit' bindings whose destination is the overworld. The exit
  // handler restores the overworld map and places the player at the
  // owning entry's entryReturnTile.
  targetIsOverworld?: boolean
}

// One entry in state.thresholdZones. Holds everything a transition
// handler needs to swap into the zone, walk around inside it, and swap
// back out. New fields can be added per zone variant (the little house
// yard uses `flora` for its sampled snapshot).
export interface ThresholdZoneState {
  id: ZoneId
  zoneVariant: Zone
  map: Tile[][]
  width: number
  height: number
  // posKey(x, y) → binding for every gate tile inside the zone.
  gatePositions: Map<string, GateBinding>
  // Set on the SOURCE entry at the moment of an enter transition to
  // the tile the steward should return to on the next exit. The
  // little house yard stores the overworld apron tile here; a Whine
  // home yard stores the Whine gate tile that opened it. Null when
  // no enter is in flight (or after the next exit consumes it).
  entryReturnTile: Position | null
  // RP-51 — whether occupying this zone pauses state.timeOfDay /
  // state.season advancement. All threshold zones in v11/v12 pause;
  // the field exists so non-pausing future variants can opt out.
  pausesPlayerTime: boolean
  // The center HouseDoorClosed tile inside the little house yard — the
  // iris-center for the yard→house transition. Optional; only the
  // little house yard sets it. Whine home yards have no front door.
  frontDoorPosition?: Position
  // Per-zone flora snapshots — sampled at zone enter for the little
  // house yard (RP-67). Other threshold zones omit this field.
  // Keyed by posKey(x, y) inside the zone's coordinate space.
  flora?: Map<string, FloraSpecies>
}

export const RuinArchetype = {
  DormantGarden: 'dormantGarden',
} as const

export type RuinArchetype = (typeof RuinArchetype)[keyof typeof RuinArchetype]

export interface DormantGardenData {
  aqueductTiles: Set<string>
  breakPoints: Position[]
  repairedBreaks: Set<string>
  seedVault: Position
  seedDecayTimers: Map<string, number>
  seedDecayAcceleration: number
  waterFlowing: boolean
  keyPosition: Position | null
  tabletPosition: Position | null
  doorPositions: Position[]
  collapseBarrier: Position[] | null
}

export interface RuinInterior {
  ruinIndex: number
  archetype: RuinArchetype
  name: string
  map: Tile[][]
  mapWidth: number
  mapHeight: number
  entranceOverworld: Position
  entranceInterior: Position
  explored: boolean
  cleared: boolean
  dormantGarden: DormantGardenData | null
  fogExplored: Set<string>
  floraMemory: Map<string, FloraMemoryEntry>
  glyph?: string
}

// RP-62 — last-seen appearance of a flora/egregore tile, captured while
// the tile was visible and rendered (dimmed) while the tile is remembered.
export interface FloraMemoryEntry {
  char: string
  color: string
}

export const DeepTimePhase = {
  Burning: 'burning',
  Simulating: 'simulating',
  Wandering: 'wandering',
} as const

export type DeepTimePhase = (typeof DeepTimePhase)[keyof typeof DeepTimePhase]

export interface DeepTimeState {
  active: boolean
  startTime: number
  phase: DeepTimePhase
  elapsedYears: number
  playerGlyph: string
  playerGlyphColor: string
  scheduledStrikeYears: number[]
  strikesCompleted: number
  shakeUntil: number
}

// RP-4 — the Revery. See docs/claude/revery.md for the phase machine and
// summary semantics. Reuses the deepTime pattern: one-frame staging, bulk
// observation with time-compressed world ticks, summary phase, closing.
export const ReveryPhase = {
  Omen: 'omen',
  Observing: 'observing',
  Summary: 'summary',
  Closing: 'closing',
} as const

export type ReveryPhase = (typeof ReveryPhase)[keyof typeof ReveryPhase]

// RP-36 — single omen variant: the Revery Knot, delivered by the
// coyote once per autumn. The original triplet (bee-on-shoulder,
// distant-meteorite, cloud-passing-sun) was retired alongside the
// detectOmen predicates in RP-32; this enum now carries one value
// preserved on ReveryState.omenKind for shape compat. _The item is
// the omen. The omen is the item._
export const OmenKind = {
  ReveryKnot: 'revery-knot',
} as const

export type OmenKind = (typeof OmenKind)[keyof typeof OmenKind]

// Pre-Revery snapshot used to compute the bilingual diff at Summary entry.
export interface ReverySnapshot {
  floraCounts: Record<FloraSpecies, number>
  egregoreCount: number
  season: Season
  reveryCount: number
}

export const PhenotypeAxis = {
  BloomTiming: 'bloomTiming',
  ColdTolerance: 'coldTolerance',
  DroughtResponse: 'droughtResponse',
  PollinatorPreference: 'pollinatorPreference',
} as const

export type PhenotypeAxis = (typeof PhenotypeAxis)[keyof typeof PhenotypeAxis]

export interface RevealedPhenotype {
  axis: PhenotypeAxis
  verdict: string
  reveryNumber: number
}

// Structured change record from the Revery diff. Each entry produces a
// summary line. ASCII lines render flora-delta; Voynich lines render
// egregore-grew; phenotype lines render phenotype-revealed.
export type ReveryChange =
  | { kind: 'flora-delta'; payload: { species: FloraSpecies; before: number; after: number } }
  | { kind: 'egregore-grew'; payload: { positions: Position[] } }
  | { kind: 'phenotype-revealed'; payload: { species: FloraSpecies; axis: PhenotypeAxis; verdict: string } }

export interface ReveryState {
  active: boolean
  startTime: number
  phase: ReveryPhase
  elapsedYears: number
  // Snapshot captured at Omen → Observing. Drives the diff at Observing → Summary.
  snapshotBeforeRevery: ReverySnapshot
  // Populated at Observing → Summary by computeReveryDiff + the phenotype +
  // egregore advance functions. Rendered by ReverySummary.tsx.
  scheduledChanges: ReveryChange[]
  // True when the diff has been computed and the React overlay should show.
  summaryReady: boolean
  // Which omen triggered this Revery. Used by the summary header.
  omenKind: OmenKind
  // RP-32 — summons-path fields. Present only when the Revery was
  // triggered by the pressure-ceiling path (state.dormancyPressure >= 1).
  // summons: true when this is a summons Revery (vs an invitation, future).
  // summonsAudioCue: flag read by future audio/render layers for the full-
  // intensity treatment. summonsCollapseTile: the steward's tile at the
  // moment of summons; consumed by the Closing-phase egregoric commit.
  summons?: boolean
  summonsAudioCue?: boolean
  summonsCollapseTile?: Position
}

export interface MeteorShowerState {
  active: boolean
  remainingStars: number
  lastSpawnTime: number
  spawnIntervalMs: number
  // Next anchor (in seasonalPhase coordinates, [0, 1)) where a shower will fire.
  // Spring is always exactly 0.0; summer/autumn/winter carry jittered values
  // (anchor ± METEOR_SHOWER_JITTER_PHASE) rolled once per year per anchor.
  pendingAnchorPhase: number
  // Index into METEOR_SHOWER_ANCHORS for the last anchor fired this year, or
  // -1 if none have fired in the current year. Used to derive the next anchor.
  lastFiredAnchorIndex: number
  // Count of complete seasonal years since game start. Increments when the
  // scheduler rolls over from winter (anchor index 3) back to spring.
  lastFiredAnchorYear: number
}

export interface LightningState {
  nextStrikeTime: number
  lastStrikeTime: number
}

export interface GlintPatch {
  centerX: number
  centerY: number
  radius: number
  birthTime: number
  lastDriftTime: number
  tiles: Set<string>
}

export interface CharMetrics {
  charWidth: number
  charHeight: number
  font: string
}

// --- RP-22 — Named regions + chronicle events ---

// What kind of feature a region is anchored to. 'prairie' is the
// always-present fallback covering walkable Dirt+Flora when no specific
// feature applies; it also catches transitions whose anchor doesn't fall
// inside any other region's tiles set.
export const NamedRegionKind = {
  Ridge: 'ridge',
  Pond: 'pond',
  River: 'river',
  CaveMouth: 'cave-mouth',
  Ruin: 'ruin',
  Village: 'village',
  MeteoriteCircle: 'meteorite-circle',
  Prairie: 'prairie',
} as const

export type NamedRegionKind = (typeof NamedRegionKind)[keyof typeof NamedRegionKind]

export interface NamedRegion {
  // Stable string id, unique within a tenure (e.g. "south-ridge",
  // "west-pond", "cave-mouth", "the-village"). Used as the regionId on
  // ChronicleEvent and as the suffix on manualDiscoveries entries
  // ("region:{id}").
  id: string
  // Sentence-cased lower-prose form for substitution into chronicle
  // templates: "the south ridge", "the village", "the west pond".
  name: string
  kind: NamedRegionKind
  // Representative tile inside the region. Chronicle event anchoring
  // and manual entry positioning both reference this.
  anchor: Position
  // Generous footprint of tiles considered part of the region. Chronicle
  // uses anchor proximity to resolve regions; manual uses any-tile overlap
  // for discovery gating.
  tiles: Set<string>
}

// Tone of a chronicle template — the registry maintains ≥50% negative
// across the whole file. Negative templates are the language of entropy;
// the prairie names what failed to happen.
export const ChronicleTemplateTone = {
  Positive: 'positive',
  Negative: 'negative',
} as const

export type ChronicleTemplateTone = (typeof ChronicleTemplateTone)[keyof typeof ChronicleTemplateTone]

// Categories partition the template registry by trigger source. Emitters
// pick from a single category and prefer matching tone, falling back to
// any template in the category if the tone pool is empty.
export const ChronicleTemplateCategory = {
  SeasonRollover: 'season-rollover',
  SpeciesExtinction: 'species-extinction',
  EgregoreReach: 'egregore-reach',
  EgregoreAdvance: 'egregore-advance',
  EgregoricFaunaSighting: 'egregoric-fauna-sighting',
  MeteoriteImpact: 'meteorite-impact',
  StoneCircle: 'stone-circle',
  HallowedGround: 'hallowed-ground',
} as const

export type ChronicleTemplateCategory = (typeof ChronicleTemplateCategory)[keyof typeof ChronicleTemplateCategory]

export interface ChronicleTemplate {
  id: string
  category: ChronicleTemplateCategory
  tone: ChronicleTemplateTone
  // Slot keys this template's text function expects. The emitter fills
  // every named slot from world state before rendering.
  slots: readonly string[]
  // Produces the past-tense sentence. Templates are short (≤12 words),
  // slot-bound, with no metaphorical or authored adjective prose.
  text: (slots: Record<string, string>) => string
}

export interface ChronicleEvent {
  // Deterministic id derived from (templateId, regionId, year, season,
  // slot keys/values). Used to dedupe within a frame — a second add with
  // the same id is a no-op.
  id: string
  templateId: string
  regionId: string
  // Tenure-year at emission time. Derived from state.reveryCount, or 0
  // pre-first-Revery.
  year: number
  season: Season
  tone: ChronicleTemplateTone
  slots: Record<string, string>
}
