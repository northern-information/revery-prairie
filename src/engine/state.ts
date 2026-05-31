import { generateCave } from './cave'
import { createKnotCellar } from './cellar'
import { getCharacterDefinition, registerGhostDefinitions } from './characters'
import {
  CAVE_HEIGHT,
  CAVE_WIDTH,
  MAP_HEIGHT,
  MAP_WIDTH,
  POOL_INITIAL_KNOTS,
  SPACE_BORDER,
  WATER_MAX,
  YARD_BULKHEAD_X,
  YARD_BULKHEAD_Y,
} from './constants'
import { ComponentType } from './ecs/types'
import { createWorld } from './ecs/world'
import { AURA_RADIUS } from './effects'
import { EGREGORE_SPECIES, getEgregoreSpeciesAtPosition } from './egregore/species'
import { createCharacterEntity } from './entities'
import { createEmptyFloraGrowthPreviews } from './floraGrowthPreviews'
import {
  createGenesisState,
  GENESIS_EPOCHS,
  nameToSeed,
  postProcessEgregoreTiles,
  postProcessMultiSpeciesFlora,
  precomputeGenesis,
} from './genesis'
import { computeReachableMass } from './genesis/shared/reachableMass'
import { detectWaterfalls } from './genesis/shared/waterfalls'
import { RuinGenerationMode } from './genesisTypes'
import { generateEgregoreGenome } from './genetics/egregore'
import { createHouseInterior } from './house'
import { autoSort } from './inventory'
import { createBackpack } from './items'
import { isWalkableTile, posKey } from './position'
import { detectNamedRegions } from './regions'
import { generateAllRuinInteriors, placeRuinEntrances } from './ruins'
import { WATERFALL_TILE_WATER_BUMP } from './tileBg'
import { buildWaterProximity } from './tileWater'
import { EgregoreActivityStage, MainQuestPhase, MoabState, OverlayMode, Season, TileType, Zone } from './types'
import { generateWeather } from './weather'
import { initWindState } from './weather/wind'
import { createLittleHouseYard } from './yard'

import type { GenesisSimState } from './genesisTypes'
import type { GameState, Position } from './types'

export const createGameState = (
  stewardName: string,
  viewportWidth: number,
  viewportHeight: number,
  genesisResult?: GenesisSimState
): GameState => {
  // Create genesis state, precompute all epochs, extract terrain
  const genesisSeed = nameToSeed(stewardName)
  const sim =
    genesisResult ??
    (() => {
      const s = createGenesisState(MAP_WIDTH, MAP_HEIGHT, genesisSeed)
      precomputeGenesis(s, GENESIS_EPOCHS)
      return s
    })()
  // Multi-species flora post-process (RP-1): scatter wildflower
  // and tall grass patches across walkable dirt and tag every Flora tile
  // with its species. Determinism preserved — same steward name, same
  // patch layout. The genesis seed is threaded through so RP-3
  // genetics can attach a deterministic identity + trait bag to each tile.
  const initialFloraLifecycle = postProcessMultiSpeciesFlora(sim, genesisSeed)

  // Egregoric flora post-process (RP-8a): place inert egregore
  // tiles biased near crater positions. Determinism preserved — same
  // steward name, same egregore positions.
  const initialEgregorePositions = postProcessEgregoreTiles(sim)

  // Track which species the post-process actually placed so the manual
  // entries unlock on first sight. The genesis post-process is
  // deterministic per steward name so if a species is missing here it
  // legitimately did not appear in this world.
  const seededSpecies = new Set<string>()
  for (const entry of initialFloraLifecycle.values()) {
    seededSpecies.add(entry.species)
  }
  const map = sim.grid
  const genesisData: GenesisSimState = sim

  // Gron sits at the exact map center; the player spawns one tile west.
  // The cave-entrance ring around Gron is unchanged.
  const gronX = Math.floor(MAP_WIDTH / 2)
  const gronY = Math.floor(MAP_HEIGHT / 2)
  const playerX = gronX - 1
  const playerY = gronY

  // Generate cave
  const cave = generateCave(CAVE_WIDTH, CAVE_HEIGHT)

  // Place cave entrance just outside Gron's rain aura
  const rainRadius = AURA_RADIUS.rain ?? 6
  const minCaveDist = rainRadius + 1 // just outside the rain
  const maxCaveDist = rainRadius + 4 // but not too far
  let caveEntranceOverworld: Position = { x: gronX + minCaveDist, y: gronY }
  let caveAttempts = 0
  while (caveAttempts < 500) {
    caveAttempts++
    // Pick random angle, random distance in [minCaveDist, maxCaveDist]
    const angle = Math.random() * Math.PI * 2
    const dist = minCaveDist + Math.random() * (maxCaveDist - minCaveDist)
    const cx = gronX + Math.round(Math.cos(angle) * dist)
    const cy = gronY + Math.round(Math.sin(angle) * dist)
    if (cx < SPACE_BORDER || cx >= MAP_WIDTH - SPACE_BORDER) continue
    if (cy < SPACE_BORDER || cy >= MAP_HEIGHT - SPACE_BORDER) continue
    if (map[cy][cx].type !== TileType.Dirt) continue
    // Reject candidates whose 3x3 footprint (entrance + 8 apron neighbors)
    // intersects ponds, rivers, or Space. Renderer draws water before tile
    // glyphs, so a footprint inside a water set renders as water and visually
    // truncates the cave to one tile or nothing.
    let footprintBlocked = false
    for (let dy = -1; dy <= 1 && !footprintBlocked; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const fx = cx + dx
        const fy = cy + dy
        const fk = posKey(fx, fy)
        if (sim.ponds.has(fk) || sim.riverPaths.has(fk) || map[fy]?.[fx]?.type === TileType.Space) {
          footprintBlocked = true
          break
        }
      }
    }
    if (footprintBlocked) continue
    caveEntranceOverworld = { x: cx, y: cy }
    break
  }
  map[caveEntranceOverworld.y][caveEntranceOverworld.x] = { type: TileType.CaveEntrance }

  // Convert the 8 neighbors of the cave entrance to CaveApron so it
  // reads as a raised stone platform on the overworld (mirrors the
  // ruin entrance pattern in ruins.ts). Skip tiles that already carry
  // structural meaning (other entrances, ruin walls/doors, etc.) so
  // ruin platforms placed earlier by genesis are preserved.
  const PRESERVE_FROM_APRON_OVERWRITE = new Set<TileType>([
    TileType.CaveEntrance,
    TileType.RuinEntrance,
    TileType.RuinApron,
    TileType.RuinWall,
    TileType.RuinDoorLocked,
    TileType.RuinDoorOpen,
    TileType.RuinAqueduct,
  ])
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = caveEntranceOverworld.x + dx
      const ny = caveEntranceOverworld.y + dy
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue
      const neighbor = map[ny][nx]
      if (!neighbor) continue
      if (PRESERVE_FROM_APRON_OVERWRITE.has(neighbor.type)) continue
      map[ny][nx] = { type: TileType.CaveApron }
    }
  }

  // Little house (RP-33). Build the 30x18 deterministic interior
  // and place the overworld HouseEntrance west of Gron, mirroring the
  // cave's ring algorithm. The interior is owned by house.ts; the
  // overworld door is placed here so it appears on the same prairie
  // grid as Gron and the cave.
  const houseInterior = createHouseInterior()
  const yard = createLittleHouseYard()
  const cellar = createKnotCellar()
  // RP-37 — mutate the back-yard tile at (YARD_BULKHEAD_X, YARD_BULKHEAD_Y)
  // into a CellarBulkhead. The yard map is otherwise untouched; the bulkhead
  // is the only yard-side tile that triggers the cellar transition.
  yard.map[YARD_BULKHEAD_Y][YARD_BULKHEAD_X] = { type: TileType.CellarBulkhead }
  const cellarBulkheadYard: Position = { x: YARD_BULKHEAD_X, y: YARD_BULKHEAD_Y }
  const minHouseDist = rainRadius + 1
  const maxHouseDist = rainRadius + 4
  let houseEntranceOverworld: Position = { x: gronX - minHouseDist, y: gronY }
  const HOUSE_PRESERVE = new Set<TileType>([
    TileType.CaveEntrance,
    TileType.CaveApron,
    TileType.RuinEntrance,
    TileType.RuinApron,
    TileType.RuinWall,
    TileType.RuinDoorLocked,
    TileType.RuinDoorOpen,
    TileType.RuinAqueduct,
  ])
  let houseAttempts = 0
  while (houseAttempts < 500) {
    houseAttempts++
    // West-biased angle: π/2 .. 3π/2 so cos(angle) is non-positive,
    // placing the candidate at x <= gronX.
    const angle = Math.PI / 2 + Math.random() * Math.PI
    const dist = minHouseDist + Math.random() * (maxHouseDist - minHouseDist)
    const cx = gronX + Math.round(Math.cos(angle) * dist)
    const cy = gronY + Math.round(Math.sin(angle) * dist)
    if (cx < SPACE_BORDER || cx >= MAP_WIDTH - SPACE_BORDER) continue
    if (cy < SPACE_BORDER || cy >= MAP_HEIGHT - SPACE_BORDER) continue
    if (map[cy][cx].type !== TileType.Dirt) continue
    let footprintBlocked = false
    for (let dy = -1; dy <= 1 && !footprintBlocked; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const fx = cx + dx
        const fy = cy + dy
        const fk = posKey(fx, fy)
        if (sim.ponds.has(fk) || sim.riverPaths.has(fk) || map[fy]?.[fx]?.type === TileType.Space) {
          footprintBlocked = true
          break
        }
        if (HOUSE_PRESERVE.has(map[fy]?.[fx]?.type)) {
          footprintBlocked = true
          break
        }
      }
    }
    if (footprintBlocked) continue
    houseEntranceOverworld = { x: cx, y: cy }
    break
  }
  map[houseEntranceOverworld.y][houseEntranceOverworld.x] = { type: TileType.HouseEntrance }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = houseEntranceOverworld.x + dx
      const ny = houseEntranceOverworld.y + dy
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue
      const neighbor = map[ny][nx]
      if (!neighbor) continue
      if (HOUSE_PRESERVE.has(neighbor.type)) continue
      if (neighbor.type === TileType.HouseEntrance) continue
      map[ny][nx] = { type: TileType.HouseApron }
    }
  }

  // Generate rain seed early so genesis presentDay can use it for rain aura rendering
  const rainSeed = Math.floor(Math.random() * 2147483647)
  sim.rainSeed = rainSeed

  const backpack = createBackpack()

  // RP-33 — the player initially spawns on the overworld here.
  // `enterHouseAtTenureStart` (called by the React hook in production)
  // swaps to the HouseInterior buffers and repositions the player.
  // Tests that don't need the house spawn keep the legacy overworld
  // start.
  const state: GameState = {
    stewardName,
    map,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    player: { x: playerX, y: playerY },
    backpack,
    playerFacing: 'down',
    facingEntityPos: null,
    camera: {
      x: playerX - Math.floor(viewportWidth / 2),
      y: playerY - Math.floor(viewportHeight / 2),
    },
    viewportWidth,
    viewportHeight,
    activeDialog: null,
    discoveredRecipes: new Set<string>(),
    previewFn: null,
    weather: generateWeather(),
    path: null,
    pathWaypoints: [],
    pathIsChained: false,
    pendingAction: null,
    pendingInteractionTarget: null,
    heldDirection: null,
    sprinting: false,
    trail: [],
    playerTween: null,
    cursorTile: null,
    cursorScreenPos: null,
    rainSeed,
    metric: true,
    audioEnabled: true,
    autoHidePanels: true,
    panelOpenMoveCount: 0,
    fontScale: 1.25,
    heldKeys: new Set(),
    currentZone: Zone.Overworld,
    overworldMap: map,
    overworldMapWidth: MAP_WIDTH,
    overworldMapHeight: MAP_HEIGHT,
    caveMap: cave.map,
    caveMapWidth: CAVE_WIDTH,
    caveMapHeight: CAVE_HEIGHT,
    caveEntranceOverworld,
    caveEntranceInterior: cave.entrance,
    caveRevealed: false,
    caveNpcSpot: cave.npcSpot,
    caveHiddenPositions: new Set(cave.hiddenChamberPositions.map(p => posKey(p.x, p.y))),
    caveBreakableWallPositions: cave.breakableWallPositions,
    houseMap: houseInterior.map,
    houseMapWidth: houseInterior.width,
    houseMapHeight: houseInterior.height,
    houseEntranceOverworld,
    houseEntranceInterior: houseInterior.spawnInterior,
    // One tile north of the south-door row inside the house. The
    // steward lands here when entering via HouseDoorClosed from the
    // yard, facing the room.
    houseDoorInteriorEntry: { x: houseInterior.exitInterior.x, y: houseInterior.exitInterior.y - 1 },
    // RP-67 — yard map built at genesis alongside the house interior.
    yardMap: yard.map,
    yardMapWidth: yard.width,
    yardMapHeight: yard.height,
    yardGatePosition: yard.gatePosition,
    yardFrontDoorPosition: yard.frontDoorPosition,
    yardEntryApron: null,
    yardFlora: new Map(),
    // RP-37 — Knot Cellar map and the bulkhead anchors. The map is
    // 7x770; the corridor reads as effectively infinite because the
    // knotCellarFog pass hides the far end at all times.
    cellarMap: cellar.map,
    cellarMapWidth: cellar.width,
    cellarMapHeight: cellar.height,
    cellarDoorSpawn: cellar.doorSpawn,
    cellarBulkheadInterior: cellar.bulkheadInterior,
    cellarBulkheadYard,
    cellarFogExplored: new Set<string>(),
    emilyInvitation: 'unoffered',
    tenureOpened: false,
    giftsReceived: new Set<string>(),
    world: createWorld(),
    meteorShower: {
      active: false,
      remainingStars: 0,
      lastSpawnTime: 0,
      spawnIntervalMs: 0,
      pendingAnchorPhase: 0.0,
      lastFiredAnchorIndex: -1,
      lastFiredAnchorYear: 0,
    },
    lightning: {
      nextStrikeTime: 60_000,
      lastStrikeTime: 0,
    },
    lastSatelliteSpawnTime: 0,
    screenShakeUntil: 0,
    floraGrowthPreviews: createEmptyFloraGrowthPreviews(),
    floraLifecycle: initialFloraLifecycle,
    activeWaves: [],
    overlayMode: OverlayMode.Default,
    egregorePositions: initialEgregorePositions,
    egregoreLifecycle: new Map(),
    lastEgregoreSpreadYear: -1,
    placedMeteorites: [],
    dragHoverTile: null,
    tileWater: new Map<string, number>(),
    soilHealth: genesisData.soilHealth,
    elevation: genesisData.elevation,
    // RP-41 — spawn-connected reachable cohort, computed from the
    // genesis map + elevation field. Read-only with respect to the
    // grid; tiles outside the set stay in the prairie as visible-
    // but-unwalkable terrain.
    reachableMass: computeReachableMass(map, genesisData.elevation, MAP_WIDTH, MAP_HEIGHT, playerX, playerY),
    // RP-64 — water tiles that drop over an unclimbable elevation
    // step. Detected once at genesis. Read by the renderer (side
    // wall), audio (positional emitter), and movement/pathfinding
    // (frozen-stairway override in winter).
    waterfalls: detectWaterfalls(
      map,
      genesisData.elevation,
      genesisData.riverPaths,
      genesisData.ponds,
      MAP_WIDTH,
      MAP_HEIGHT
    ),
    ponds: genesisData.ponds,
    rivers: genesisData.riverPaths,
    burnScars: genesisData.burnScars,
    craters: new Set<string>(genesisData.craters),
    manualDiscoveries: new Set<string>(),
    manualState: {
      activeCategory: null,
      searchQuery: '',
      revealedHints: new Set<string>(),
    },
    lastDialogTypingTick: 0,
    glintingCoins: new Set<string>(),
    coinGlintPopTimes: new Map<string, number>(),
    seedGenomes: new Map(),
    equippedItemUid: null,
    divinedHexagrams: new Set<number>(),
    glintZones: new Set<string>(),
    glintPatches: [],
    glintOpacity: new Map<string, number>(),
    lastGlintSpawnTime: 0,
    civilizationRuins: genesisData.ruins,
    mainQuestPhase: MainQuestPhase.AwaitingCoyote,
    ruinGenerationMode: RuinGenerationMode.Starter,
    deepTime: null,
    deepTimeTransition: null,
    revery: null,
    reveryCount: 0,
    lastReveryEndTime: 0,
    cosmologicalDrift: 0,
    revealedPhenotypes: new Map(),
    dormancyPressure: 0,
    collapsedStewardTile: null,
    playerStationarySince: 0,
    postGiftActionsCompleted: new Set<string>(),
    rainFrontOffset: 0,
    precipitationIntensity: 0,
    seasonalPhase: 0,
    currentDate: { month: 3, day: 20 },
    lockedBurnLine: null,
    burnLineIndex: null,
    lastSeenSeason: Season.Winter,
    moabState: MoabState.Idle,
    wind: initWindState(),
    pollen: [],
    pollenTrailDepth: 0,
    waterProximity: new Map<string, number>(),
    genesis: genesisData,
    bootTitleCard: null,
    zoneTransition: null,
    reentryLock: null,
    nextAngelSpawnTime: 60_000, // first angel after ~60s
    angelFlashTime: 0,
    coyoteCargo: null,
    ruinInteriors: generateAllRuinInteriors(genesisData.ruins),
    currentRuinIndex: null,
    caveFogExplored: new Set<string>(),
    caveFloraMemory: new Map(),
    overworldFogExplored: new Set<string>(),
    overworldFloraMemory: new Map(),
    multiplayerSession: null,
    remotePlayers: new Map(),
    scannedSpecimens: new Map(),
    oakSpecimens: [],
    egregoreSpecimens: [],
    scanInProgress: null,
    manualHighlightEntryId: null,
    onPlayerMoved: null,
    onGenesisComplete: null,
    cameraFilm: new Map(),
    placedCameras: [],
    cameraArchive: new Map(),
    playbackCameraUid: null,
    photographAlbum: [],
    itemWear: {},
    namedRegions: [],
    chronicle: [],
    // RP-36 — Revery Knot. The first Summer → Autumn edge arms a
    // scripted-route delivery; the first Knot stamps harvestYear = 0
    // (= 1 - POOL_INITIAL_KNOTS), the pre-play year.
    knotDelivery: null,
    bedKnotPresent: false,
    archivedKnots: [],
    lastKnotDeliveryArmed: false,
    lastKnotPickupAt: 0,
    lastKnotPickupTile: null,
    lastKnotPickupHarvestYear: 0,
    lastArchiveReveryCount: 0,
    knotHarvestYearCounter: 1 - POOL_INITIAL_KNOTS,
    knotHarvestYears: new Map(),
  }

  // RP-64 — Receiving-tile water bump. Each waterfall's bottom
  // tile gets a small tileWater increment so downstream flora has
  // access to the moisture the fall delivers. Skipped when the
  // bottom is itself a river or pond (already wet — would
  // double-count). Local only; no transitive watershed propagation.
  for (const waterfall of state.waterfalls.values()) {
    const bottomKey = posKey(waterfall.bottomX, waterfall.bottomY)
    if (state.rivers.has(bottomKey) || state.ponds.has(bottomKey)) continue
    const existing = state.tileWater.get(bottomKey) ?? 0
    state.tileWater.set(bottomKey, existing + WATERFALL_TILE_WATER_BUMP)
  }

  // RP-22 — Detect named regions once per tenure. Single writer; the
  // returned array is assigned to state.namedRegions and never mutated
  // by any tick handler. Deterministic per steward name because every
  // input (ponds, ruins, craters, tectonic axes, cave entrance) is
  // already deterministic from the seeded genesis simulation.
  state.namedRegions = detectNamedRegions({
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    map,
    ponds: genesisData.ponds,
    ruins: genesisData.ruins,
    craters: new Set(genesisData.craters),
    tectonicAxes: genesisData.tectonicAxes,
    caveEntranceOverworld,
    villageCenter: { x: gronX, y: gronY },
  })

  // Glinting zone patches are seeded later, inside completeGenesis,
  // using performance.now() so all patches start in fade-in. Seeding
  // at game-state creation with time=0 made patches age throughout
  // genesis (~25s) and pop in at full opacity at the handoff.

  // Unlock manual entries for each species that the post-process
  // placed. The prairie is visible from spawn, so species that are
  // present read as "discovered" immediately.
  for (const species of seededSpecies) {
    state.manualDiscoveries.add(`flora:${species}`)
  }

  // Unlock manual entries for each placed egregore tile. Vision-gated
  // discovery is deferred to #4 — for this PR every egregore entry is
  // discoverable from spawn (the player still has to navigate to find
  // them on the map).
  for (const pos of initialEgregorePositions) {
    state.manualDiscoveries.add(`egregore:${String(pos.x)},${String(pos.y)}`)
  }

  // RP-8b — seed activity-state entries for every egregore tile.
  // Species + genome are deterministic per (steward, position) so the
  // lifecycle starts identical across reloads. Initial stage is Active
  // when the game starts in Winter (rare at genesis); otherwise Dormant.
  // The lifecycle ticker will flip them as soon as the season changes.
  const initialEgregoreStage =
    state.weather.season === Season.Winter ? EgregoreActivityStage.Active : EgregoreActivityStage.Dormant
  for (const pos of initialEgregorePositions) {
    const species = getEgregoreSpeciesAtPosition(pos.x, pos.y)
    const genome = generateEgregoreGenome(pos.x, pos.y, stewardName, EGREGORE_SPECIES[species].traitBias)
    state.egregoreLifecycle.set(posKey(pos.x, pos.y), {
      stage: initialEgregoreStage,
      stageStartTime: 0,
      species,
      genome,
    })
  }

  // Place ruin entrances on the overworld
  placeRuinEntrances(map, state.ruinInteriors)

  // Place Gron at the exact center
  if (map[gronY][gronX].type !== TileType.Dirt && map[gronY][gronX].type !== TileType.Flora) {
    map[gronY][gronX] = { type: TileType.Dirt }
  }
  const gronDef = getCharacterDefinition('gron')
  const gronMusic = gronDef.music ? { url: gronDef.music, radius: AURA_RADIUS.rain } : undefined
  createCharacterEntity(state, 'gron', { x: gronX, y: gronY }, { aura: 'rain', music: gronMusic })

  // Initialize tile water for all walkable overworld tiles. Run AFTER
  // placeRuinEntrances and the Gron fallback because both can mutate
  // tile types in ways that need the water invariant honored.
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const tileType = map[y][x].type
      if (tileType === TileType.Dirt || tileType === TileType.Flora || tileType === TileType.BurntFlora) {
        state.tileWater.set(posKey(x, y), WATER_MAX)
      }
    }
  }

  // Build water proximity map for passive seepage near ponds/rivers
  buildWaterProximity(state)

  // Pre-compute reachable tiles from player spawn (belt-and-suspenders with genesis connectivity).
  // Water is walkable, so it does not block reachability.
  const reachableSet = new Set<string>()
  const bfsQueue: string[] = [posKey(playerX, playerY)]
  reachableSet.add(posKey(playerX, playerY))
  const bfsDirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  while (bfsQueue.length > 0) {
    const cur = bfsQueue.shift()
    if (cur === undefined) break
    const [xStr, yStr] = cur.split(',')
    const bx = Number(xStr)
    const by = Number(yStr)
    for (const [ddx, ddy] of bfsDirs) {
      const nx = bx + ddx
      const ny = by + ddy
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue
      const nk = posKey(nx, ny)
      if (reachableSet.has(nk)) continue
      if (!isWalkableTile(map[ny][nx].type)) continue
      reachableSet.add(nk)
      bfsQueue.push(nk)
    }
  }

  // Spawn 3 ghosts at random walkable, reachable positions
  const ghostCount = 3
  const ghostUsedKeys = new Set<string>([posKey(playerX, playerY), posKey(gronX, gronY)])
  const ghostNumbers: number[] = []
  let attempts = 0
  while (ghostNumbers.length < ghostCount && attempts < 500) {
    attempts++
    const gx = SPACE_BORDER + Math.floor(Math.random() * (MAP_WIDTH - SPACE_BORDER * 2))
    const gy = SPACE_BORDER + Math.floor(Math.random() * (MAP_HEIGHT - SPACE_BORDER * 2))
    const key = posKey(gx, gy)
    if (ghostUsedKeys.has(key)) continue
    if (!reachableSet.has(key)) continue
    const tile = map[gy][gx]
    if (tile.type === TileType.Space || tile.type === TileType.Sand) continue
    ghostUsedKeys.add(key)
    const ghostNumber = ghostNumbers.length + 1
    ghostNumbers.push(ghostNumber)
    createCharacterEntity(
      state,
      `ghost-${String(ghostNumber)}`,
      { x: gx, y: gy },
      {
        behavior: { type: 'drift', moveChance: 0.15, freezeOnDialog: true },
      }
    )
  }
  registerGhostDefinitions(ghostNumbers)

  // Spawn 3 coins at random walkable, reachable dirt tiles
  const coinUsedKeys = new Set<string>(ghostUsedKeys)
  let coinCount = 0
  let coinAttempts = 0
  while (coinCount < 3 && coinAttempts < 500) {
    coinAttempts++
    const cx = SPACE_BORDER + Math.floor(Math.random() * (MAP_WIDTH - SPACE_BORDER * 2))
    const cy = SPACE_BORDER + Math.floor(Math.random() * (MAP_HEIGHT - SPACE_BORDER * 2))
    const key = posKey(cx, cy)
    if (coinUsedKeys.has(key)) continue
    if (!reachableSet.has(key)) continue
    const tile = map[cy][cx]
    if (tile.type !== TileType.Dirt) continue
    coinUsedKeys.add(key)
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: cx, y: cy })
    state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: 'coin' })
    state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })
    coinCount++
  }

  // Create Moab in the cave (persists permanently, tagged as cave zone)
  createCharacterEntity(state, 'moab', { ...cave.npcSpot }, { zone: Zone.Cave })

  // RP-33 — create Emily inside the little house at her idle
  // position (by the hearth, west of the fire). Stationary, no AI tick;
  // appears only when state.currentZone === Zone.HouseInterior.
  createCharacterEntity(state, 'emily', { x: 5, y: 2 }, { zone: Zone.HouseInterior })

  // Precis #23 v9 R3 — the film roll begins on the floor of the little
  // house at (2, 6) as the implicit first goal. _A roll without a
  // camera_: the steward picks it up, finds no camera in the room,
  // and walks outside to look. The Field Camera itself spawns in the
  // overworld adjacent to the oak nearest the house entrance — see
  // seedTenureStartFieldCamera below.
  {
    const e = state.world.createEntity()
    state.world.addComponent(e, ComponentType.Position, { x: 2, y: 6 })
    state.world.addComponent(e, ComponentType.ItemDrop, { definitionId: 'filmRoll' })
    state.world.addComponent(e, ComponentType.EntityTag, 'groundItem')
    state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.HouseInterior })
  }

  // Field Camera seeding lives in completeGenesis (post-seedOaks) —
  // the spawn requires the oak network to exist before it can pick
  // the nearest one. See genesis.ts.

  autoSort(backpack)

  return state
}

/**
 * RP-33 — production hook calls this after createGameState to
 * place the player inside the little house at tenure start. The state
 * leaves createGameState in the legacy overworld posture so tests that
 * call createGameState directly retain their original assumptions.
 * The React hook (src/hooks/useGameEngine.ts) calls this immediately
 * after creating the state.
 */
export const enterHouseAtTenureStart = (state: GameState): void => {
  state.map = state.houseMap
  state.mapWidth = state.houseMapWidth
  state.mapHeight = state.houseMapHeight
  state.currentZone = Zone.HouseInterior
  state.player = { x: state.houseEntranceInterior.x, y: state.houseEntranceInterior.y }
  // Face west — Emily is across the room to the steward's left, by the
  // chair. The first frame should frame the two of them together at
  // the fire.
  state.playerFacing = 'left'
  state.camera = {
    x: state.player.x - Math.floor(state.viewportWidth / 2),
    y: state.player.y - Math.floor(state.viewportHeight / 2),
  }
}
