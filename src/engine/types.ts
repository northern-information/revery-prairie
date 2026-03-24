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
  Critter: 'critter',
  Flora: 'flora',
  Tool: 'tool',
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
  icon: string
  iconColor: string
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

export interface GameState {
  stewardName: string
  map: Tile[][]
  mapWidth: number
  mapHeight: number
  player: Position
  backpack: Container
  openContainer: Container | null
  camera: Position
  viewportWidth: number
  viewportHeight: number
  bees: Bee[]
  groundItems: GroundItem[]
  discoveredRecipes: Set<string>
  previewFn: ((state: GameState) => { pos: Position; char: string; color: string }[]) | null
  weather: Weather
  path: Position[] | null
  pendingAction: (() => void) | null
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
