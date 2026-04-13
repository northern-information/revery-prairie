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
} as const

export type ItemCategory = (typeof ItemCategory)[keyof typeof ItemCategory]

export const Rotation = {
  R0: 0,
  R90: 1,
  R180: 2,
  R270: 3,
} as const

export type Rotation = (typeof Rotation)[keyof typeof Rotation]

export interface ItemDefinition {
  id: string
  name: string
  description: string
  glyph: string
  glyphColor: string
  weight: number
  category: ItemCategory
  shape: boolean[][]
}

export interface ItemInstance {
  uid: string
  definitionId: string
  rotation: Rotation
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

export type CharacterBehavior = DriftBehavior

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
  description: string
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
  omniboxContainers: Map<string, Container>
  nextOmniboxNumber: number
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
  meteorShower: MeteorShowerState
  lightning: LightningState
  omniboxStrikeCounts: Map<string, number>
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
  postGiftActionsCompleted: Set<string>
  rainFrontOffset: number
  rainIntensity: number
  waterProximity: Map<string, number>
  genesis: GenesisSimState | null
  angelCantos: string[]
  nextAngelSpawnTime: number
  angelEncounterCount: number
  angelFlashTime: number
  devPanelOpen: boolean
  devPaintPreview: { x1: number; y1: number; x2: number; y2: number } | null
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
} as const

export type Zone = (typeof Zone)[keyof typeof Zone]

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
