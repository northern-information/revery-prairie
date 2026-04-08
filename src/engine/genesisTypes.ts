import type { Position, Tile } from './types'

export const GenesisEpochId = {
  CosmicFormation: 'cosmicFormation',
  PlanetaryAccretion: 'planetaryAccretion',
  MagmaEra: 'magmaEra',
  CrustCooling: 'crustCooling',
  FirstWater: 'firstWater',
  EmergenceOfLife: 'emergenceOfLife',
  FireSeason: 'fireSeason',
  Regrowth: 'regrowth',
  IceAge: 'iceAge',
  PostGlacialDieOff: 'postGlacialDieOff',
  WarmPeriod: 'warmPeriod',
  RiseOfCivilizations: 'riseOfCivilizations',
  FallOfCivilizations: 'fallOfCivilizations',
  PresentDay: 'presentDay',
} as const

export type GenesisEpochId = (typeof GenesisEpochId)[keyof typeof GenesisEpochId]

export interface GenesisTileRender {
  char: string
  color: string
  dx: number
  dy: number
}

export interface GenesisEpoch {
  id: GenesisEpochId
  durationMs: number
  commentary: string
  /** Mutate the simulation grid and accumulate soil/ruin data. Called once at epoch start. */
  mutate: (sim: GenesisSimState) => void
  /** Return char(s) + color for a given tile position at the given progress (0-1). */
  renderTile: (
    sim: GenesisSimState,
    x: number,
    y: number,
    progress: number,
    time: number
  ) => GenesisTileRender[]
}

export interface CivilizationRuin {
  position: Position
  name: string
  radius: number
  age: number
  aqueductPaths: Position[][]
  buildingFootprints: Position[]
}

export interface GenesisSimState {
  grid: Tile[][]
  width: number
  height: number
  soilHealth: Map<string, number>
  volcanicHeat: Map<string, number>
  ancientSeabeds: Set<string>
  glacialPaths: Set<string>
  riverPaths: Set<string>
  vegetationMap: Map<string, number>
  burnScars: Set<string>
  ruins: CivilizationRuin[]
  aqueductNetwork: Map<string, string>
  aqueductJunctions: Position[]
  epochIndex: number
  epochStartTime: number
  rng: () => number
  tileData: Map<string, { char: string; baseColor: string; intensity: number }>
  /** Tracks whether the optional second fire occurred during warm period */
  secondFireOccurred: boolean
  /** Land boundary mask — true for tiles that are land (not space) */
  landMask: Set<string>
  /** Coastline boundary tiles (sand zone) */
  coastlineTiles: Set<string>
  /** Snapshot of vegetation map before glacier mutation, for dramatic render */
  preGlacialVegetation: Map<string, number>
  /** Per-column noise offsets for top and bottom glacier edges */
  glacialEdgeNoise: { top: number[]; bottom: number[] }
  /** Meteorite streak data for fire season animation */
  meteorites: GenesisMeteorStreak[]
  /** River paths as ordered arrays for progressive reveal */
  riverPathsOrdered: { x: number; y: number }[][]
  /** Glacier meltwater pool positions */
  meltPools: Set<string>
  /** Permanent small pond positions */
  ponds: Set<string>
}

export interface GenesisMeteorStreak {
  /** Starting position (off-map edge) */
  startX: number
  startY: number
  /** Velocity per step */
  dx: number
  dy: number
  /** Where the meteorite impacts land */
  impactX: number
  impactY: number
  /** Trail length in tiles */
  length: number
  /** Normalized time (0-1) within the epoch when this streak begins */
  startTime: number
}

export interface GenesisResult {
  terrain: Tile[][]
  soilHealth: Map<string, number>
  ruins: CivilizationRuin[]
  /** Permanent pond positions (enriched soil, future water tile support) */
  ponds: Set<string>
}
