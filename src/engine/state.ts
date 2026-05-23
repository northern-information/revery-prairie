import { generateCave } from './cave'
import { getCharacterDefinition, registerGhostDefinitions } from './characters'
import { CAVE_HEIGHT, CAVE_WIDTH, MAP_HEIGHT, MAP_WIDTH, SPACE_BORDER, WATER_MAX } from './constants'
import { ComponentType } from './ecs/types'
import { createWorld } from './ecs/world'
import { AURA_RADIUS } from './effects'
import { createCharacterEntity } from './entities'
import {
  createGenesisState,
  GENESIS_EPOCHS,
  nameToSeed,
  postProcessEgregoreTiles,
  postProcessMultiSpeciesFlora,
  precomputeGenesis,
} from './genesis'
import { RuinGenerationMode } from './genesisTypes'
import { autoSort } from './inventory'
import { createBackpack } from './items'
import { EGREGORE_SPECIES, getEgregoreSpeciesAtPosition } from './egregore/species'
import { generateEgregoreGenome } from './genetics/egregore'
import { isWalkableTile, posKey } from './position'
import { generateAllRuinInteriors, placeRuinEntrances } from './ruins'
import { buildWaterProximity } from './tileWater'
import { createEmptyFloraGrowthPreviews } from './floraGrowthPreviews'
import {
  EgregoreActivityStage,
  MainQuestPhase,
  MoabState,
  OverlayMode,
  Season,
  Sky,
  TileType,
  Zone,
} from './types'
import { generateWeather } from './weather'
import { initWindState } from './weather/wind'

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
  // Multi-species flora post-process (precis #1): scatter wildflower
  // and tall grass patches across walkable dirt and tag every Flora tile
  // with its species. Determinism preserved — same steward name, same
  // patch layout. The genesis seed is threaded through so precis #3
  // genetics can attach a deterministic identity + trait bag to each tile.
  const initialFloraLifecycle = postProcessMultiSpeciesFlora(sim, genesisSeed)

  // Egregoric flora post-process (precis #8a): place inert egregore
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

  // Generate rain seed early so genesis presentDay can use it for rain aura rendering
  const rainSeed = Math.floor(Math.random() * 2147483647)
  sim.rainSeed = rainSeed

  const backpack = createBackpack()

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
    rightInsetTiles: 0,
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
    giftsReceived: new Set<string>(),
    world: createWorld(),
    meteorShower: {
      active: false,
      remainingStars: 0,
      lastSpawnTime: 0,
      spawnIntervalMs: 0,
      // Game starts at seasonalPhase = 0.0 (spring equinox). The first
      // tickMeteorShower call sees pendingAnchorPhase === 0.0 and the
      // current phase at 0.0, fires the spring shower immediately, and
      // pre-targets the player tile as the steward star (because
      // playerSpawn.triggeredAt is 0).
      pendingAnchorPhase: 0.0,
      lastFiredAnchorIndex: -1,
      lastFiredAnchorYear: 0,
    },
    playerSpawn: {
      // visible defaults to true so headless tests/setups (no gameloop) work.
      // The gameloop's player-spawn-trigger tick runs before the first render
      // and flips this to false, kicking off the spawn ceremony.
      visible: true,
      spawnPos: { x: playerX, y: playerY },
      meteorEntityId: null,
      triggeredAt: 0,
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
    tileWater: new Map<string, number>(),
    soilHealth: genesisData.soilHealth,
    elevation: genesisData.elevation,
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
    divinedHexagrams: new Set<number>(),
    glintZones: new Set<string>(),
    glintPatches: [],
    glintOpacity: new Map<string, number>(),
    lastGlintSpawnTime: 0,
    civilizationRuins: genesisData.ruins,
    mainQuestPhase: MainQuestPhase.AwaitingCoyote,
    ruinGenerationMode: RuinGenerationMode.Starter,
    pendingSavedBees: false,
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
    lastSky: Sky.Sun,
    postGiftActionsCompleted: new Set<string>(),
    rainFrontOffset: 0,
    precipitationIntensity: 0,
    seasonalPhase: 0,
    currentDate: { month: 3, day: 20 },
    burnLineDraft: null,
    lockedBurnLine: null,
    burnLineIndex: null,
    burnDrawMode: false,
    lastSeenSeason: Season.Winter,
    moabState: MoabState.Idle,
    wind: initWindState(),
    pollen: [],
    pollenTrailDepth: 0,
    waterProximity: new Map<string, number>(),
    genesis: genesisData,
    bootTitleCard: null,
    zoneTransition: null,
    angelCantos: [],
    nextAngelSpawnTime: 60_000, // first angel after ~60s
    angelEncounterCount: 0,
    angelFlashTime: 0,
    coyoteCargo: null,
    ruinInteriors: generateAllRuinInteriors(genesisData.ruins),
    currentRuinIndex: null,
    caveFogExplored: new Set<string>(),
    caveFogDiscovered: new Set<string>(),
    devPanelOpen: false,
    devPaintPreview: null,
    devEntityPreview: null,
    multiplayerSession: null,
    remotePlayers: new Map(),
    scannedSpecimens: new Map(),
    oakSpecimens: [],
    egregoreSpecimens: [],
    scanInProgress: null,
    manualHighlightEntryId: null,
    onPlayerMoved: null,
    onGenesisComplete: null,
  }

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

  // Precis #8b — seed activity-state entries for every egregore tile.
  // Species + genome are deterministic per (steward, position) so the
  // lifecycle starts identical across reloads. Initial stage is Active
  // when the game starts in Winter (rare at genesis); otherwise Dormant.
  // The lifecycle ticker will flip them as soon as the season changes.
  const initialEgregoreStage = state.weather.season === Season.Winter ? EgregoreActivityStage.Active : EgregoreActivityStage.Dormant
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

  autoSort(backpack)

  return state
}
