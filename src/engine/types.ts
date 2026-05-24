import type { World } from './ecs/world'
import type { EgregoreGenome, FloraGenome, TraitBag } from './genetics'
import type { CivilizationRuin, GenesisSimState, RuinGenerationMode } from './genesisTypes'
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
  // HouseFloor / HouseWall make up the 30x18 interior. HouseBed sits on
  // the east wall (Revery destination); HouseChair on the west wall
  // (Emily's during-Revery position). Fireplace is animated `^~*` at
  // FIRE_TICK_MS cadence. HouseExit is the 3-wide south door rendered
  // in pink (`#ff69b4`) per the cave/ruin exit idiom.
  HouseEntrance: 'houseEntrance',
  HouseApron: 'houseApron',
  HouseFloor: 'houseFloor',
  HouseWall: 'houseWall',
  HouseBed: 'houseBed',
  HouseChair: 'houseChair',
  Fireplace: 'fireplace',
  HouseHearth: 'houseHearth',
  HouseExit: 'houseExit',
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
}

export interface ItemInstance {
  uid: string
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
}

export interface FollowBehavior {
  type: 'follow'
}

export type CharacterBehavior = DriftBehavior | FollowBehavior

// Time-lapse camera (precis #23). A camera placed on a tile records
// "photographs" of meaningful events inside its 3x3 footprint. Each
// photograph captures the {char, color} of the 9 cells at the moment the
// event fired, plus the subject kind and timestamp. Film count is the
// only wear surface; the body itself is eternal but unreloadable.
export const CameraSubject = {
  Pollination: 'pollination',
  Rain: 'rain',
  Bloom: 'bloom',
  Ember: 'ember',
  MonarchVisit: 'monarchVisit',
  GhostPassage: 'ghostPassage',
  EgregoreScan: 'egregoreScan',
  CharacterApproach: 'characterApproach',
  // Precis #23 v9 R3 — pre-seeded subject for the inherited Field
  // Camera's four seasonal frames of the nearest oak. Authored at
  // genesis time, not produced by recordCameraSubjectEvent.
  SeasonalLandmark: 'seasonalLandmark',
} as const

export type CameraSubject = (typeof CameraSubject)[keyof typeof CameraSubject]

export interface TimeLapseCell {
  char: string
  color: string
}

export interface TimeLapseFrame {
  recordedAt: number
  subject: CameraSubject
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
  portrait?: string
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
export type ZoneTransitionKind = 'cave' | 'ruin' | 'house'

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
  activeDialog: {
    characterId: string
    lineIndex: number
    typingIndex: number
    typingDone: boolean
    transitioning: boolean
    transitionStartTime: number
    awaitingConfirmation?: boolean
  } | null
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
  // Interior spawn position (one tile north of the middle exit).
  houseEntranceInterior: Position
  // Interior bed position (Revery destination — east wall).
  houseBedInterior: Position
  // Interior chair position (Emily's during-Revery seat — west wall).
  houseChairInterior: Position
  // Emily's invitation state machine. 'unoffered' at genesis; flips to
  // 'offered' when her autumn last line arms awaitingConfirmation;
  // 'confirmed' on [f]-consume; resets to 'unoffered' at dialog close
  // without confirm or at Revery Closing.
  emilyInvitation: 'unoffered' | 'offered' | 'confirmed'
  // Emily's idle position snapshot during a Revery — written at
  // Omen → Observing, read+cleared at Closing.
  emilyReveryReturn: Position | null
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
  // RP-18 — transient inventory-hover preview flag. Owner + clearers:
  // InventoryGrid's onMouseEnter sets it true when a meteorite cell is
  // hovered; onMouseLeave (or hover of a non-meteorite) clears it. The
  // stoneCircles render pass reads state.player on every draw when the
  // flag is true, so preview lines follow the steward as they move.
  stoneCirclePreview: boolean
  // RP-18 — tile the cursor is hovering on while an inventory drag
  // is over the canvas. The stoneCircles render pass draws a pink cell
  // highlight on this tile so the steward sees where the drop will
  // land. Owner: useCanvasDrop (mousemove writes, cancel/drop clears).
  dragHoverTile: Position | null
  soilHealth: Map<string, number>
  elevation: Map<string, number>
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
  divinedHexagrams: Set<number>
  glintZones: Set<string>
  glintPatches: GlintPatch[]
  glintOpacity: Map<string, number>
  lastGlintSpawnTime: number
  civilizationRuins: CivilizationRuin[]
  mainQuestPhase: MainQuestPhase
  ruinGenerationMode: RuinGenerationMode
  pendingSavedBees: boolean
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
  // Previous frame's state.weather.sky value. Updated by gameLoop after
  // tickWeather. The cloud-passing omen that originally read this field
  // was retired in RP-32; the field is retained for any future use.
  lastSky: Sky
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
  angelCantos: string[]
  nextAngelSpawnTime: number
  angelEncounterCount: number
  angelFlashTime: number
  coyoteCargo: string | null
  ruinInteriors: RuinInterior[]
  currentRuinIndex: number | null
  caveFogExplored: Set<string>
  caveFogDiscovered: Set<string>
  // RP-38 — overworld fog of war. Player-facing vocabulary is
  // gaze / memory / unseen; engineering identifiers mirror caveFog*.
  // Both sets are initialized empty per tenure (createGameState).
  overworldFogExplored: Set<string>
  overworldFogDiscovered: Set<string>
  autoHidePanels: boolean
  panelOpenMoveCount: number
  devPanelOpen: boolean
  devPaintPreview: { x1: number; y1: number; x2: number; y2: number; tileType: string } | null
  devEntityPreview: { x: number; y: number; char: string; color: string } | null
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
  cameraArchive: Map<string, TimeLapseFrame[]>
  playbackCameraUid: string | null
  // Precis #53 (v9 thinktank R3). Chronological photograph album.
  // Frames migrate here from cameraArchive[uid] + placedCameras[i].
  // frames whenever the TimeLapsePlayback modal dismisses. Persists
  // across tenures. The camera is the lens; the album is the keeping.
  photographAlbum: TimeLapseFrame[]
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
} as const

export type Zone = (typeof Zone)[keyof typeof Zone]

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
  fogDiscovered: Set<string>
  glyph?: string
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

export const OmenKind = {
  BeeOnShoulder: 'bee-on-shoulder',
  DistantMeteorite: 'distant-meteorite',
  CloudPassingSun: 'cloud-passing-sun',
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

