import type { World } from './ecs/world'
import type { CivilizationRuin, GenesisSimState, RuinGenerationMode } from './genesisTypes'
import type { ColorId } from '@revery-prairie/shared'

export const TileType = {
  Space: 'space',
  Dirt: 'dirt',
  Clover: 'clover',
  BurntClover: 'burntClover',
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
  openContainer: Container | null
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
  cloverGrowthPreviews: Set<string>
  cloverLifecycle: Map<string, CloverLifecycleState>
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
  postGiftActionsCompleted: Set<string>
  rainFrontOffset: number
  rainIntensity: number
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
  queuedEvents: QueuedEvent[]
  caveFogExplored: Set<string>
  caveFogDiscovered: Set<string>
  caveFogIllumination: Map<string, number>
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
  onPlayerMoved: (() => void) | null
  onGenesisEpochStart: ((commentary: string, epochIndex: number) => void) | null
  onGenesisComplete: ((handoffTime: number) => void) | null
}

export const CloverStage = {
  Healthy: 'healthy',
  Brown: 'brown',
  BlinkingRed: 'blinkingRed',
  Black: 'black',
  Decomposing: 'decomposing',
  BurntRecovering: 'burntRecovering',
} as const

export type CloverStage = (typeof CloverStage)[keyof typeof CloverStage]

export interface CloverLifecycleState {
  stage: CloverStage
  stageStartTime: number
  hasLight: boolean
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
} as const

export type Sky = (typeof Sky)[keyof typeof Sky]

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
  debrisPositions: Position[]
  seedVault: Position
  seedDecayTimers: Map<string, number>
  seedDecayAcceleration: number
  waterFlowing: boolean
  keyPosition: Position | null
  tabletPosition: Position | null
  doorPositions: Position[]
  collapseBarrier: Position[] | null
}

export interface QueuedEvent {
  text: string
  icon: string
  iconColor: string
  worldX: number
  worldY: number
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
  fogIllumination: Map<string, number>
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

export interface MeteorShowerState {
  active: boolean
  nextShowerTime: number
  remainingStars: number
  lastSpawnTime: number
  spawnIntervalMs: number
  radiantDx: number
  radiantDy: number
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
