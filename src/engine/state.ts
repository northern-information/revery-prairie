import { autoAssignRevery } from './actionBar'
import { generateCave } from './cave'
import { registerGhostDefinitions } from './characters'
import { CAVE_HEIGHT, CAVE_WIDTH, MAP_HEIGHT, MAP_WIDTH, SPACE_BORDER, WATER_MAX, ZOOM_DEFAULT } from './constants'
import { ComponentType } from './ecs/types'
import { createWorld } from './ecs/world'
import { AURA_RADIUS } from './effects'
import { createCharacterEntity } from './entities'
import { createGenesisState, GENESIS_EPOCHS, nameToSeed, precomputeGenesis } from './genesis'
import { rebuildGlintZones, seedGlintPatches } from './glintZones'
import { autoSort, placeItem } from './inventory'
import { createBackpack } from './items'
import { isInBounds, isWalkableTile, posKey } from './position'
import { buildWaterProximity } from './tileWater'
import { CoyoteMode, TileType, Zone } from './types'
import { generateWeather } from './weather'

import type { GenesisSimState } from './genesisTypes'
import type { GameState, Position } from './types'

export const createGameState = (stewardName: string, viewportWidth: number, viewportHeight: number): GameState => {
  // Create genesis state, precompute all epochs, extract terrain
  const seed = nameToSeed(stewardName)
  const sim = createGenesisState(MAP_WIDTH, MAP_HEIGHT, seed)
  precomputeGenesis(sim, GENESIS_EPOCHS)
  const map = sim.grid
  const genesisData: GenesisSimState = sim

  const playerX = Math.floor(MAP_WIDTH / 2)
  const playerY = Math.floor(MAP_HEIGHT / 2)

  // Gron position (used for cave entrance placement and character spawn)
  const gronX = playerX + 5
  const gronY = playerY

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
    caveEntranceOverworld = { x: cx, y: cy }
    break
  }
  map[caveEntranceOverworld.y][caveEntranceOverworld.x] = { type: TileType.CaveEntrance }

  const backpack = createBackpack()
  placeItem(backpack, 'bee', 0, 0)
  placeItem(backpack, 'bee', 1, 0)
  placeItem(backpack, 'bee', 2, 0)
  placeItem(backpack, 'clover', 0, 1)
  placeItem(backpack, 'clover', 1, 1)
  placeItem(backpack, 'clover', 2, 1)

  const state: GameState = {
    stewardName,
    map,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    player: { x: playerX, y: playerY },
    backpack,
    openContainer: null,
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
    pendingAction: null,
    pendingInteractionTarget: null,
    heldDirection: null,
    heldActionSlot: null,
    targetingSlot: null,
    sprinting: false,
    trail: [],
    cursorTile: null,
    cursorScreenPos: null,
    hoverPath: null,
    hoverPathTarget: null,
    rainSeed: Math.floor(Math.random() * 2147483647),
    metric: true,
    musicEnabled: true,
    fontScale: 1.25,
    zoom: ZOOM_DEFAULT,
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
    reveries: [],
    actionBar: [null, null, null, null],
    giftsReceived: new Set<string>(),
    world: createWorld(),
    meteorShower: {
      active: false,
      nextShowerTime: 1,
      remainingStars: 0,
      lastSpawnTime: 0,
      spawnIntervalMs: 0,
      radiantDx: 0,
      radiantDy: 0,
    },
    lightning: {
      nextStrikeTime: 60_000,
      lastStrikeTime: 0,
    },
    cloverGrowthPreviews: new Set<string>(),
    cloverLifecycle: new Map(),
    tileWater: new Map<string, number>(),
    soilHealth: genesisData.soilHealth,
    elevation: genesisData.elevation,
    ponds: genesisData.ponds,
    rivers: genesisData.riverPaths,
    burnScars: genesisData.burnScars,
    manualDiscoveries: new Set<string>(['item:bee', 'item:clover']),
    manualState: {
      activeCategory: null,
      searchQuery: '',
      revealedHints: new Set<string>(),
    },
    lastDialogTypingTick: 0,
    glintingCoins: new Set<string>(),
    divinedHexagrams: new Set<number>(),
    glintZones: new Set<string>(),
    glintPatches: [],
    glintOpacity: new Map<string, number>(),
    lastGlintSpawnTime: 0,
    civilizationRuins: genesisData.ruins,
    deepTime: null,
    postGiftActionsCompleted: new Set<string>(),
    rainFrontOffset: 0,
    rainIntensity: 0,
    waterProximity: new Map<string, number>(),
    genesis: genesisData,
    genesisTransition: null,
    angelCantos: [],
    nextAngelSpawnTime: 60_000, // first angel after ~60s
    angelEncounterCount: 0,
    angelFlashTime: 0,
    coyoteMode: CoyoteMode.Follow,
    coyoteCargo: null,
    coyotePath: null,
    devPanelOpen: false,
    devPaintPreview: null,
    devEntityPreview: null,
  }

  // Seed glinting zone patches with staggered birth times
  seedGlintPatches(state, 0)
  rebuildGlintZones(state, 0)

  // Initialize tile water for all walkable overworld tiles
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const tileType = map[y][x].type
      if (tileType === TileType.Dirt || tileType === TileType.Clover || tileType === TileType.BurntClover) {
        state.tileWater.set(posKey(x, y), WATER_MAX)
      }
    }
  }

  // Build water proximity map for passive seepage near ponds/rivers
  buildWaterProximity(state)

  // Place Gron near the player
  if (map[gronY][gronX].type !== TileType.Dirt && map[gronY][gronX].type !== TileType.Clover) {
    // Fallback: ensure tile is dirt then place
    map[gronY][gronX] = { type: TileType.Dirt }
  }
  createCharacterEntity(state, 'gron', { x: gronX, y: gronY }, { aura: 'rain' })

  // Spawn coyote adjacent to player
  const coyoteBlocked = new Set<string>([posKey(playerX, playerY), posKey(gronX, gronY)])
  for (const d of [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ]) {
    const cx = playerX + d.x
    const cy = playerY + d.y
    if (isInBounds(cx, cy, MAP_WIDTH, MAP_HEIGHT) && isWalkableTile(map[cy][cx].type) && !coyoteBlocked.has(posKey(cx, cy))) {
      createCharacterEntity(state, 'coyote', { x: cx, y: cy }, { behavior: { type: 'follow' } })
      break
    }
  }

  // Pre-compute reachable tiles from player spawn (belt-and-suspenders with genesis connectivity)
  const waterBlocked = new Set<string>()
  for (const pk of state.ponds) waterBlocked.add(pk)
  for (const rk of state.rivers) waterBlocked.add(rk)
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
      if (waterBlocked.has(nk)) continue
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

  // Player starts with Earth and Lightning reveries
  state.reveries.push('earth')
  autoAssignRevery(state, 'earth')
  state.reveries.push('lightning')
  autoAssignRevery(state, 'lightning')

  return state
}
