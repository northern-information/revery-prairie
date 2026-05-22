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
  // Egregoric flora tile — inert in precis #8a (no interaction, no
  // lifecycle, walkable). The renderer draws it using a Voynich glyph
  // from EGREGORE_GLYPHS keyed by tile position. Per cosmology doctrine
  // egregores are "not-of-this-Earth" — no Latin binomial, no Flora
  // species id. Manual entries are procedurally-generated EVA token
  // pages with ~1-in-5 Latin pierces.
  Egregore: 'egregore',
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

export const CoyoteMode = {
  Follow: 'follow',
  Collect: 'collect',
} as const

export type CoyoteMode = (typeof CoyoteMode)[keyof typeof CoyoteMode]

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
export type ZoneTransitionKind = 'cave' | 'ruin'

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

// ─── precis #6 — naturalist's manual scan ────────────────────────────────────

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
  rightInsetTiles: number
  activeDialog: {
    characterId: string
    lineIndex: number
    typingIndex: number
    typingDone: boolean
    transitioning: boolean
    transitionStartTime: number
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
  musicEnabled: boolean
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
  giftsReceived: Set<string>
  world: World
  // Precis #17 — per-species growth-preview queues. Each species owns
  // its own pending-preview Set so wildflower previews don't commit as
  // clover tiles and vice versa. Use helpers in floraGrowthPreviews.ts
  // — addGrowthPreview, hasAnyGrowthPreview, clearAllGrowthPreviews,
  // getGrowthPreviewSet — rather than touching the Map directly from
  // call sites that don't care about species.
  floraGrowthPreviews: Map<FloraSpecies, Set<string>>
  floraLifecycle: Map<string, FloraLifecycleState>
  // Precis #17 — active ceremony waves awaiting tickFloraWaves.
  // Plain JSON-serializable. No Entity refs — the wave is bound to a
  // seedIdentity (lineage source) rather than the bee that cast it.
  activeWaves: WaveEmission[]
  // Precis #17 — current overlay rendering mode. Cycled by the [1]/[2]/[3]
  // keybinds in useKeyboard.ts. Default at game start: OverlayMode.Default.
  overlayMode: OverlayMode
  // Egregoric flora tile positions (precis #8a). Genesis places ~3
  // inert TileType.Egregore tiles biased near craters; this list lets
  // the manual entry generator and the sidebar identify them without
  // a full map scan. Stable across reloads for the same steward name.
  egregorePositions: Position[]
  // Per-tile activity state for the egregoric biome (precis #8b). Keyed
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
  soilHealth: Map<string, number>
  elevation: Map<string, number>
  ponds: Set<string>
  rivers: Set<string>
  tileWater: Map<string, number>
  burnScars: Set<string>
  craters: Set<string>
  meteorShower: MeteorShowerState
  playerSpawn: PlayerSpawn
  lastSatelliteSpawnTime: number
  screenShakeUntil: number
  lightning: LightningState
  manualDiscoveries: Set<string>
  manualState: ManualState
  lastDialogTypingTick: number
  glintingCoins: Set<string>
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
  // Precis #4 — the Revery (long-form ceremonial phase).
  revery: ReveryState | null
  // Lifetime count of completed Reveries. Increments on Closing → null.
  reveryCount: number
  // Wall-clock time of the last Revery's Closing. Used by REVERY_COOLDOWN_MS
  // gating in detectOmen so back-to-back Reveries can't fire within one year.
  lastReveryEndTime: number
  // Monotonic accumulator of cosmological drift (v3 doctrine). 0 baseline in
  // this PR; future features wire passive transmission (v3 layer (a)) and
  // meteorite-placement (v3 layer (c)) increments.
  cosmologicalDrift: number
  // Per-species list of revealed phenotype labels. Each Revery resolves one
  // (species, axis) pair via resolvePhenotypeLabel. Re-resolving the same
  // pair OVERWRITES — no duplicates per (species, axis).
  revealedPhenotypes: Map<FloraSpecies, RevealedPhenotype[]>
  // Wall-clock time of the player's last successful movePlayer. Used by the
  // cloud-passing omen to detect "player stationary for N ms" without
  // changing movement logic. Updated by movement.ts.
  playerStationarySince: number
  // Previous frame's state.weather.sky value. Used by the cloud-passing omen
  // to detect Rain/Cloudy → Sun transitions. Updated by gameLoop after
  // tickWeather.
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
  // Precis #9b — Torchbearer behavior pass.
  // burnLineDraft: tiles the player is editing. Persists across save/load.
  //   Consumed at the Winter → Spring transition.
  // lockedBurnLine: the line Moab walks this Spring. Set at thaw from
  //   burnLineDraft; cleared at Spring → Summer.
  // burnLineIndex: Moab's progress along lockedBurnLine. null when idle.
  // burnDrawMode: input mode toggle ([b] key). When true, mouse clicks
  //   chain burn-line waypoints instead of movement.
  // lastSeenSeason: the previous tick's weather.season. Drives transition
  //   detection (Winter → Spring lock, Spring → Summer cleanup).
  // moabState: see MoabState. Tracks Moab's role in the burn cycle.
  burnLineDraft: Position[] | null
  lockedBurnLine: Position[] | null
  burnLineIndex: number | null
  burnDrawMode: boolean
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
  coyoteMode: CoyoteMode
  coyoteCargo: string | null
  coyotePath: Position[] | null
  ruinInteriors: RuinInterior[]
  currentRuinIndex: number | null
  caveFogExplored: Set<string>
  caveFogDiscovered: Set<string>
  selectedUnits: Set<number>
  selectionBox: SelectionBox | null
  unitCommands: Map<number, UnitCommand>
  moveOrderMarkers: MoveOrderMarker[]
  autoHidePanels: boolean
  panelOpenMoveCount: number
  devPanelOpen: boolean
  devPaintPreview: { x1: number; y1: number; x2: number; y2: number; tileType: string } | null
  devEntityPreview: { x: number; y: number; char: string; color: string } | null
  multiplayerSession: MultiplayerSession | null
  remotePlayers: Map<string, RemotePlayer>
  // Precis #6 — naturalist's manual scan-to-discover.
  // scannedSpecimens maps each flora species to an ordered list of
  // specimens the player has scanned, oldest first. Duplicates (same
  // identity) are deduped at commit time. The manual entry renders a
  // card stack with paging, one card per specimen.
  scannedSpecimens: Map<FloraSpecies, ScannedSpecimen[]>
  // Oak scans live in their own array (oaks aren't flora so they don't have
  // a FloraSpecies key). Same dedupe-by-identity rule applies.
  oakSpecimens: ScannedSpecimen[]
  // Egregore tile scans (precis #8a). Egregores have no FloraSpecies key
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
}

export const FloraStage = {
  Healthy: 'healthy',
  Brown: 'brown',
  BlinkingRed: 'blinkingRed',
  Black: 'black',
  Decomposing: 'decomposing',
  BurntRecovering: 'burntRecovering',
  // Winter pause stage (precis #2). Set when state.weather.season is Winter.
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
  // Precis #3 — SHA256 identity + trait bag. Stable per plant across
  // its lifecycle (preserved through BurntRecovering, lost when the entry
  // is deleted after the dying chain). All construction sites route
  // through createFloraLifecycleEntry in floraLifecycle.ts.
  identity: string
  traits: TraitBag
  // Precis #17 — bee-mediated pollination. When a bee/monarch with a
  // matching-species pollen load (different identity) enters this tile,
  // the tile is "primed" for a cross. On the next autonomous spread,
  // the child's traits are computed via crossTraitBags(this.traits,
  // primedPollen.traits, rng) and primedPollen is cleared. Father =
  // pollen load, mother = this tile. Most-recent matching load wins.
  primedPollen?: PollenLoad
  // Precis #17 — set on flora tiles that sprouted from a primed cross.
  // Records the first 8 hex chars of the donor (father) lineage at
  // cross time so the family-tree overlay can draw a second dashed
  // edge to the donor's lineage prefix index.
  crossDonorPrefix?: string
  // Precis #17 — set on flora tiles that sprouted via the spread engine
  // (or the ceremony wave). Records the first 8 hex chars of the parent
  // (mother) lineage at sprout time so the family-tree overlay can
  // draw a solid edge to the parent without having to reverse the SHA
  // derivation. Genesis-placed flora and orphaned previews leave this
  // undefined.
  parentPrefix?: string
}

// Precis #17 — bee-mediated pollination. A single load carried by a
// bee/monarch in its PollenBag component (registered in ecs/types.ts).
// Cross-species mixing is allowed in the bag; the cross-prime rule only
// fires when a load's species matches the visited tile's species.
export interface PollenLoad {
  identity: string
  traits: TraitBag
  species: FloraSpecies
}

// Precis #17 — ceremony wave. Emitted by the bee+clover combine and
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

// Precis #17 — overlay view mode cycled by the [1]/[2]/[3] keybinds.
// Default: standard rendering. FamilyTree: lineage overlay (gated by
// per-species sequencing). RootMycelium: reserved for a future precis;
// the [3] keybind currently shows a "not yet" toast and does not
// change mode.
export const OverlayMode = {
  Default: 'default',
  FamilyTree: 'familyTree',
  RootMycelium: 'rootMycelium',
} as const

export type OverlayMode = (typeof OverlayMode)[keyof typeof OverlayMode]

// --- Precis #8b — Egregoric flora (mechanical biome) ---

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
// (precis-thinktank-v5 round 1) — iso is not a viewing layer applied to a
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

// Precis #9b — Moab the Torchbearer's lifecycle states. 'idle' is the
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

// Precis #4 — the Revery. See docs/claude/revery.md for the phase machine and
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
}

export interface MeteorShowerState {
  active: boolean
  nextShowerTime: number
  remainingStars: number
  lastSpawnTime: number
  spawnIntervalMs: number
}

export interface PlayerSpawn {
  visible: boolean
  spawnPos: Position
  meteorEntityId: number | null
  triggeredAt: number
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

export interface UnitCommand {
  targetEntityId: number
  target: Position
  path: Position[] | null
}

export interface SelectionBox {
  startScreen: { x: number; y: number }
  endScreen: { x: number; y: number }
}

export interface MoveOrderMarker {
  position: Position
  time: number
}
