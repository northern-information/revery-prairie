import { autoAssignRevery } from './actionBar'
import { generateCave } from './cave'
import { registerGhostDefinitions } from './characters'
import { CAVE_HEIGHT, CAVE_WIDTH, MAP_HEIGHT, MAP_WIDTH, SPACE_BORDER, ZOOM_DEFAULT } from './constants'
import { ComponentType } from './ecs/types'
import { createWorld } from './ecs/world'
import { AURA_RADIUS } from './effects'
import { createCharacterEntity } from './entities'
import { autoSort, placeItem } from './inventory'
import { createBackpack } from './items'
import { posKey } from './position'
import { generateSoilHealth, generateTerrain } from './terrain'
import { Rotation, TileType, Zone } from './types'
import { generateWeather } from './weather'

import type { GenesisResult } from './genesisTypes'
import type { GameState, Position } from './types'

export const createGameState = (
  stewardName: string,
  viewportWidth: number,
  viewportHeight: number,
  genesisResult?: GenesisResult
): GameState => {
  const map = genesisResult?.terrain ?? generateTerrain(MAP_WIDTH, MAP_HEIGHT)
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
  placeItem(backpack, 'bee', Rotation.R0, 0, 0)
  placeItem(backpack, 'bee', Rotation.R0, 1, 0)
  placeItem(backpack, 'bee', Rotation.R0, 2, 0)
  placeItem(backpack, 'clover', Rotation.R0, 0, 1)
  placeItem(backpack, 'clover', Rotation.R0, 1, 1)
  placeItem(backpack, 'clover', Rotation.R0, 2, 1)

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
    omniboxContainers: new Map(),
    nextOmniboxNumber: 1,
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
    omniboxStrikeCounts: new Map<string, number>(),
    cloverGrowthPreviews: new Set<string>(),
    cloverLifecycle: new Map(),
    soilHealth: genesisResult?.soilHealth ?? generateSoilHealth(map, MAP_WIDTH, MAP_HEIGHT),
    elevation: genesisResult?.elevation ?? new Map<string, number>(),
    ponds: genesisResult?.ponds ?? new Set<string>(),
    rivers: genesisResult?.rivers ?? new Set<string>(),
    burnScars: genesisResult?.burnScars ?? new Set<string>(),
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
    civilizationRuins: genesisResult?.ruins ?? [],
  }

  // Place Gron near the player
  if (map[gronY][gronX].type !== TileType.Dirt && map[gronY][gronX].type !== TileType.Clover) {
    // Fallback: ensure tile is dirt then place
    map[gronY][gronX] = { type: TileType.Dirt }
  }
  createCharacterEntity(state, 'gron', { x: gronX, y: gronY }, { aura: 'rain' })

  // Spawn 3 ghosts at random walkable positions
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

  // Spawn 3 coins at random walkable dirt tiles
  const coinUsedKeys = new Set<string>(ghostUsedKeys)
  let coinCount = 0
  let coinAttempts = 0
  while (coinCount < 3 && coinAttempts < 500) {
    coinAttempts++
    const cx = SPACE_BORDER + Math.floor(Math.random() * (MAP_WIDTH - SPACE_BORDER * 2))
    const cy = SPACE_BORDER + Math.floor(Math.random() * (MAP_HEIGHT - SPACE_BORDER * 2))
    const key = posKey(cx, cy)
    if (coinUsedKeys.has(key)) continue
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

  // Player starts with Earth Revery
  state.reveries.push('earth')
  autoAssignRevery(state, 'earth')

  return state
}
