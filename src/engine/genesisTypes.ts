import type { Position, Tile } from './types'

export const GenesisEpochId = {
  CosmicFormation: 'cosmicFormation',
  LandAccretion: 'landAccretion',
  LavaEra: 'lavaEra',
  CrustCooling: 'crustCooling',
  TectonicUplift: 'tectonicUplift',
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
  renderTile: (sim: GenesisSimState, x: number, y: number, progress: number, time: number) => GenesisTileRender[]
}

export const RuinGenerationMode = {
  Starter: 'starter',
  Complex: 'complex',
} as const

export type RuinGenerationMode = (typeof RuinGenerationMode)[keyof typeof RuinGenerationMode]

export const RuinRole = {
  Clover: 'clover',
  Bee: 'bee',
  Coyote: 'coyote',
} as const

export type RuinRole = (typeof RuinRole)[keyof typeof RuinRole]

export interface CivilizationRuin {
  position: Position
  name: string
  radius: number
  age: number
  aqueductPaths: Position[][]
  buildingFootprints: Position[]
  /** Tutorial role tagging used in 'starter' generation mode. Optional —
   *  'complex'-mode ruins (post-deep-time) leave this undefined. */
  role?: RuinRole
}

export interface TectonicAxis {
  /** Polyline of land tile positions forming the ridge crest. */
  polyline: Position[]
  /** Average orientation in radians (atan2 of end-to-start delta). */
  orientationRadians: number
  /** Peak uplift amount in elevation units (0-100 scale). */
  intensity: number
  /** Falloff radius in tiles. */
  radius: number
}

export interface EpochSnapshot {
  vegetationMap: Map<string, number>
  riverPaths: Set<string>
  ponds: Set<string>
  elevation: Map<string, number>
  volcanicHeat: Map<string, number>
  ancientSeabeds: Set<string>
  burnScars: Set<string>
  meteorites: GenesisMeteorStreak[]
  lightningBolts: GenesisLightningBolt[]
  preGlacialVegetation: Map<string, number>
  glacialPaths: Set<string>
  meltPools: Set<string>
  tileData: Map<string, { char: string; baseColor: string; intensity: number }>
  aqueductNetwork: Map<string, string>
  ruins: CivilizationRuin[]
  satelliteCrashes: GenesisSatelliteCrash[]
  craters: Set<string>
  tectonicAxes: TectonicAxis[]
  lowlandWaterMask: Set<string>
}

/** Per-tile lift tween record. fromLift is a pixel value (not a tier
 *  index) so a new tween that starts mid-flight eases from the
 *  currently-visible lift instead of snapping to the discrete fromTier
 *  lift. toTier is the destination tier — its lift is recomputed each
 *  frame via getTierLift to keep the record small and lerp endpoint
 *  unambiguous. startMs is the frame time at which the tween began. */
export interface TierTween {
  fromLift: number
  toTier: number
  startMs: number
}

export interface GenesisSimState {
  grid: Tile[][]
  width: number
  height: number
  soilHealth: Map<string, number>
  volcanicHeat: Map<string, number>
  /** Elevation per land tile (0-100, higher = taller) */
  elevation: Map<string, number>
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
  /** Last rAF time passed to tickGenesis — used by getEpochProgress so the
   *  tick and render share the same clock (avoids performance.now() drift). */
  lastTickTime: number
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
  /** Lightning bolt data for fire season animation */
  lightningBolts: GenesisLightningBolt[]
  /** Satellite crash streak data for fall-of-civilizations animation */
  satelliteCrashes: GenesisSatelliteCrash[]
  /** Crater posKeys accumulated by satellite crashes (carries into game state) */
  craters: Set<string>
  /** Tectonic ridge axes seeded during TectonicUplift; read by later epochs for biome bias. */
  tectonicAxes: TectonicAxis[]
  /** River paths as ordered arrays for progressive reveal */
  riverPathsOrdered: { x: number; y: number }[][]
  /** Glacier meltwater pool positions */
  meltPools: Set<string>
  /** Permanent small pond positions */
  ponds: Set<string>
  /** Coherent cosmetic-water mask used by aquatic-phase epochs (FirstWater
   *  through WarmPeriod's pre-river render). Built once in FirstWater.mutate
   *  from a seeded 2D smooth-noise field combined with elevation; read by
   *  renderLowlandWater (genesis.ts) and isLowlandWater (genesisRenderer.ts).
   *  Stable across IceAge / PostGlacialDieOff / WarmPeriod elevation drops. */
  lowlandWaterMask: Set<string>
  /** Per-epoch snapshots of fields that later mutations destructively modify */
  epochSnapshots: EpochSnapshot[]
  /** Whether all mutations have been pre-computed */
  mutationsPrecomputed: boolean
  /** Number of epochs that have already fired their narration callback.
   *  Guards against double-firing when an epoch has been narrated live and
   *  then completeGenesis flushes remaining epochs. */
  narratedEpochCount: number
  /** Rain aura tile hash seed — set from GameState.rainSeed so presentDay
   *  rain overlay matches the game renderer exactly. */
  rainSeed: number
  /** Generation mode for civilization ruins. 'starter' produces 3 tutorial
   *  ruins with role tags (clover/bee/coyote); 'complex' is reserved for the
   *  post-deep-time regeneration spec and currently delegates to 'starter'. */
  ruinGenerationMode: RuinGenerationMode
  /** Cosmetic-only render state: per-tile elevation-tier tween records.
   *  Populated lazily by the genesis renderer on every frame for visible
   *  tiles whose tier just changed. NOT part of EpochSnapshot — render
   *  state, not simulation state. Discarded with the rest of sim at the
   *  genesis-to-gameplay handoff. Keyed by posKey(x, y). */
  tierTweens: Map<string, TierTween>
  /** Cosmetic-only render state: the elevation tier the renderer last
   *  observed for each visible tile. Used to detect tier changes between
   *  frames so the renderer can start a tween. Keyed by posKey(x, y). */
  lastObservedTier: Map<string, number>
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

export interface GenesisLightningBolt {
  impactX: number
  impactY: number
  path: { x: number; y: number }[]
  branch: { x: number; y: number }[] | null
  startTime: number
}

export interface GenesisSatelliteCrash {
  /** Off-map start position */
  startX: number
  startY: number
  /** Velocity per step */
  dx: number
  dy: number
  /** Impact position on land */
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
  elevation: Map<string, number>
  ruins: CivilizationRuin[]
  ponds: Set<string>
  rivers: Set<string>
  burnScars: Set<string>
  craters: Set<string>
}
