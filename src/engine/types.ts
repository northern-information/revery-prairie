export const TileType = {
  Space: 'space',
  Dirt: 'dirt',
  Clover: 'clover',
  Sand: 'sand',
} as const

export type TileType = (typeof TileType)[keyof typeof TileType]

export interface Tile {
  type: TileType
}

export interface Position {
  x: number
  y: number
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

export interface GroundItem {
  definitionId: string
  pos: Position
}

export interface Bee {
  pos: Position
}

export interface ShootingStar {
  pos: Position
  dx: number // -1, 0, or 1
  dy: number // -1, 0, or 1
  length: number // trail length (3–6 tiles)
  age: number // ticks alive (for max-age cleanup)
  willLand: boolean // if true, converts to meteorite when hitting land
  landingTarget: Position | null // exact tile to land on (null = land on first walkable)
}

export interface Meteorite {
  pos: Position
}

export interface LandingExplosion {
  pos: Position // center of the explosion (where the star landed)
  startTime: number // rAF timestamp when the explosion began
}

export interface MeteoritePickupEffect {
  pos: Position // center of the bloom (where the meteorite was)
  startTime: number // rAF timestamp when the effect began
}

export interface GroundOmnibox {
  uid: string // links to ItemInstance.uid and omniboxContainers key
  pos: Position
}

export interface CharacterDefinition {
  id: string
  name: string
  glyph: string
  glyphColor: string
  portrait?: string
  dialog: string[]
}

export interface Character {
  definitionId: string
  pos: Position
  aura?: string
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
  facingOmniboxPos: Position | null
  camera: Position
  viewportWidth: number
  viewportHeight: number
  bees: Bee[]
  shootingStars: ShootingStar[]
  meteorites: Meteorite[]
  explosions: LandingExplosion[]
  meteoritePickupEffects: MeteoritePickupEffect[]
  groundItems: GroundItem[]
  groundOmniboxes: GroundOmnibox[]
  characters: Character[]
  activeDialog: { characterId: string; lineIndex: number } | null
  omniboxContainers: Map<string, Container>
  nextOmniboxNumber: number
  discoveredRecipes: Set<string>
  previewFn: ((state: GameState) => { pos: Position; char: string; color: string }[]) | null
  weather: Weather
  path: Position[] | null
  pendingAction: (() => void) | null
  cursorTile: Position | null
  cursorScreenPos: { x: number; y: number } | null
  rainSeed: number
  metric: boolean
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
