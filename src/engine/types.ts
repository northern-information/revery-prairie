import type { World } from './ecs/world'
import type { CivilizationRuin, GenesisSimState } from './genesisTypes'

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
  RuinFloor: 'ruinFloor',
  RuinWall: 'ruinWall',
  RuinEntrance: 'ruinEntrance',
  RuinUnstable: 'ruinUnstable',
  RuinAqueduct: 'ruinAqueduct',
  RuinAqueductBroken: 'ruinAqueductBroken',
  RuinDebris: 'ruinDebris',
  RuinMachine: 'ruinMachine',
  RuinMachineActive: 'ruinMachineActive',
  RuinHiddenFloor: 'ruinHiddenFloor',
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

export const ItemCategory = {
  Fauna: 'fauna',
  Flora: 'flora',
  Tool: 'tool',
  CelestialDebris: 'celestial debris',
  Gizmo: 'gizmo',
  Seed: 'seed',
  Artifact: 'artifact',
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

export interface CharacterDefinition {
  id: string
  name: string
  glyph: string
  glyphColor: string
  portrait?: string
  dialog: string[]
  music?: string
  gift?: { kind: 'revery' | 'item'; id: string }
  postGiftDialog?: string[]
  postGift?: { kind: 'revery' | 'item'; id: string }
}

export interface ReveryDefinition {
  id: string
  name: string
  glyphs: string[]
  glyphColor: string
  cooldownMs: number
  castDurationMs: number
  castStyle: 'tile' | 'rain' | 'scan' | 'targeted' | 'deepTime'
  castPattern: Position[]
}

export interface ActionBarSlot {
  kind: 'revery' | 'item'
  id: string
  cooldownEndTime: number
  cooldownDurationMs: number
}

export interface TransitionFade {
  startTime: number
  duration: number
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
  pendingAction: (() => void) | null
  pendingInteractionTarget: Position | null
  heldDirection: Direction | null
  heldActionSlot: number | null
  targetingSlot: number | null
  sprinting: boolean
  trail: TrailPoint[]
  cursorTile: Position | null
  cursorScreenPos: { x: number; y: number } | null
  hoverPath: Position[] | null
  hoverPathTarget: Position | null
  rainSeed: number
  metric: boolean
  musicEnabled: boolean
  fontScale: number
  zoom: number
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
  reveries: string[]
  actionBar: (ActionBarSlot | null)[]
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
  deepTime: DeepTimeState | null
  deepTimeTransition: TransitionFade | null
  postGiftActionsCompleted: Set<string>
  rainFrontOffset: number
  rainIntensity: number
  waterProximity: Map<string, number>
  genesis: GenesisSimState | null
  genesisTransition: TransitionFade | null
  angelCantos: string[]
  nextAngelSpawnTime: number
  angelEncounterCount: number
  angelFlashTime: number
  coyoteMode: CoyoteMode
  coyoteCargo: string | null
  coyotePath: Position[] | null
  ruinInteriors: RuinInterior[]
  currentRuinIndex: number | null
  ruinEjection: RuinEjection | null
  queuedToasts: QueuedToast[]
  caveFogExplored: Set<string>
  caveFogIllumination: Map<string, number>
  selectedUnits: Set<number>
  playerSelected: boolean
  selectionBox: SelectionBox | null
  unitCommands: Map<number, UnitCommand>
  moveOrderMarkers: MoveOrderMarker[]
  autoHidePanels: boolean
  panelOpenMoveCount: number
  devPanelOpen: boolean
  devPaintPreview: { x1: number; y1: number; x2: number; y2: number; tileType: string } | null
  devEntityPreview: { x: number; y: number; char: string; color: string } | null
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

export type Direction = 'up' | 'down' | 'left' | 'right'

export const Zone = {
  Overworld: 'overworld',
  Cave: 'cave',
  Ruin: 'ruin',
} as const

export type Zone = (typeof Zone)[keyof typeof Zone]

export const RuinArchetype = {
  Subsidence: 'subsidence',
  DormantGarden: 'dormantGarden',
  HauntedThreshold: 'hauntedThreshold',
  Resonance: 'resonance',
} as const

export type RuinArchetype = (typeof RuinArchetype)[keyof typeof RuinArchetype]

export interface SubsidenceData {
  structuralIntegrity: Map<string, number>
  collapseTimer: number
  collapseRate: number
  seedPositions: Position[]
  collapsed: boolean
}

export interface DormantGardenData {
  aqueductTiles: Set<string>
  breakPoints: Position[]
  repairedBreaks: Set<string>
  debrisPositions: Position[]
  seedVault: Position
  seedDecayTimers: Map<string, number>
  seedDecayAcceleration: number
  waterFlowing: boolean
}

export interface GhostFormation {
  positions: Position[]
  wantedItems: string[]
  satisfied: boolean[]
}

export interface HauntedThresholdData {
  rooms: { center: Position; width: number; height: number }[]
  ghostFormations: GhostFormation[]
  innerChamber: Position[]
  artifactPosition: Position
}

export interface ResonanceData {
  machinePositions: Position[]
  machineActiveUntil: Map<string, number>
  activationDurationMs: number
  hiddenTiles: Set<string>
  vaultPosition: Position
  vaultRevealed: boolean
  revealedTiles: Set<string>
}

export const RuinEjectionReason = {
  SealedIn: 'sealed-in',
  EntranceCollapse: 'entrance-collapse',
  FloorCollapse: 'floor-collapse',
} as const

export type RuinEjectionReason = (typeof RuinEjectionReason)[keyof typeof RuinEjectionReason]

export const RuinEjectionPhase = {
  Shake: 'shake',
  Fade: 'fade',
  Hold: 'hold',
  Notification: 'notification',
} as const

export type RuinEjectionPhase = (typeof RuinEjectionPhase)[keyof typeof RuinEjectionPhase]

export interface LostItemSummary {
  ruinName: string
  archetype: RuinArchetype
  items: { definitionId: string; count: number }[]
}

export interface RuinEjection {
  startTime: number
  phase: RuinEjectionPhase
  reason: RuinEjectionReason
  ruinIndex: number
  lostItems: LostItemSummary
  exited: boolean
}

export interface QueuedToast {
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
  subsidence: SubsidenceData | null
  dormantGarden: DormantGardenData | null
  hauntedThreshold: HauntedThresholdData | null
  resonance: ResonanceData | null
  fogExplored: Set<string>
  fogIllumination: Map<string, number>
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
