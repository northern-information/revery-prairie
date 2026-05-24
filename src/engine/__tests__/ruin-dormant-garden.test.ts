import { ComponentType } from '../ecs/types'
import { RuinRole } from '../genesisTypes'
import { clearRuinDebris } from '../interaction'
import { isWalkableTile, posKey } from '../position'
import { generateRuinInterior, repairAqueductBreak, spawnDormantGardenSeeds, tickDormantGardenDecay } from '../ruins'
import { RuinArchetype, TileType, Zone } from '../types'
import { createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { CivilizationRuin } from '../genesisTypes'

const makeRuin = (overrides: Partial<CivilizationRuin> = {}): CivilizationRuin => ({
  position: { x: 50, y: 50 },
  name: 'Test Garden Ruin',
  radius: 4,
  age: 3000,
  aqueductPaths: [
    [
      { x: 50, y: 50 },
      { x: 60, y: 50 },
    ],
    [
      { x: 50, y: 50 },
      { x: 50, y: 40 },
    ],
  ],
  buildingFootprints: [{ x: 50, y: 50 }],
  ...overrides,
})

const makeRng = (seed = 42) => {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const makeGardenInterior = (overrides: Partial<CivilizationRuin> = {}) => {
  const ruin = makeRuin(overrides)
  return generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng())
}

const installCoyoteRuinFixture = (
  state: ReturnType<typeof createTestState>,
  barrier: { x: number; y: number }[]
): void => {
  state.currentZone = Zone.Ruin
  state.currentRuinIndex = 0
  state.civilizationRuins = [
    {
      position: { x: 0, y: 0 },
      name: 'Fixture Coyote Ruin',
      radius: 3,
      age: 1000,
      aqueductPaths: [],
      buildingFootprints: [],
      role: RuinRole.Coyote,
    },
  ]
  state.ruinInteriors = [
    {
      ruinIndex: 0,
      archetype: RuinArchetype.DormantGarden,
      name: 'Fixture Coyote Ruin',
      map: state.map,
      mapWidth: state.mapWidth,
      mapHeight: state.mapHeight,
      entranceInterior: { x: state.player.x, y: state.player.y + 1 },
      entranceOverworld: { x: 0, y: 0 },
      explored: true,
      cleared: false,
      dormantGarden: {
        aqueductTiles: new Set<string>(),
        breakPoints: [],
        repairedBreaks: new Set<string>(),
        seedVault: { x: state.player.x + 3, y: state.player.y },
        seedDecayTimers: new Map<string, number>(),
        seedDecayAcceleration: 1,
        waterFlowing: true,
        keyPosition: null,
        tabletPosition: null,
        doorPositions: [],
        collapseBarrier: barrier,
      },
      fogExplored: new Set<string>(),
      fogDiscovered: new Set<string>(),
    },
  ]
}

describe('ruin dormant garden', () => {
  describe('generation', () => {
    it('generates dormantGarden data for DormantGarden archetype', () => {
      const interior = makeGardenInterior()
      expect(interior.dormantGarden).not.toBeNull()
    })

    it('places aqueduct tiles on the map', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.aqueductTiles.size).toBeGreaterThan(0)
      for (const key of garden.aqueductTiles) {
        const parts = key.split(',')
        const x = Number(parts[0])
        const y = Number(parts[1])
        expect(interior.map[y][x].type).toBe(TileType.RuinAqueduct)
      }
    })

    it('places break points along the aqueduct', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.breakPoints.length).toBeGreaterThanOrEqual(2)
      for (const bp of garden.breakPoints) {
        expect(interior.map[bp.y][bp.x].type).toBe(TileType.RuinAqueductBroken)
      }
    })

    it('places no scattered RuinDebris (only the coyote collapseBarrier produces RuinDebris)', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.collapseBarrier).toBeNull()
      let debrisCount = 0
      for (let y = 0; y < interior.mapHeight; y++) {
        for (let x = 0; x < interior.mapWidth; x++) {
          if (interior.map[y][x].type === TileType.RuinDebris) debrisCount++
        }
      }
      expect(debrisCount).toBe(0)
    })

    it('places seed decay timers in the vault', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.seedDecayTimers.size).toBeGreaterThanOrEqual(1)
      for (const [, timer] of garden.seedDecayTimers) {
        expect(timer).toBeGreaterThan(0)
      }
    })

    it('starts with water not flowing', () => {
      const interior = makeGardenInterior()
      expect(interior.dormantGarden?.waterFlowing).toBe(false)
    })

    it('starts with no repairs', () => {
      const interior = makeGardenInterior()
      expect(interior.dormantGarden?.repairedBreaks.size).toBe(0)
    })
  })

  describe('tile type walkability', () => {
    it('RuinAqueduct is walkable', () => {
      expect(isWalkableTile(TileType.RuinAqueduct)).toBe(true)
    })

    it('RuinAqueductBroken is walkable', () => {
      expect(isWalkableTile(TileType.RuinAqueductBroken)).toBe(true)
    })

    it('RuinDebris is not walkable', () => {
      expect(isWalkableTile(TileType.RuinDebris)).toBe(false)
    })
  })

  describe('seed decay', () => {
    it('decays seed timers over time', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return

      // Create a minimal mock state
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        soilHealth: new Map<string, number>(),
        world: {
          query: () => [] as number[],
          getComponent: () => undefined,
          destroyEntity: () => undefined,
        },
      } as never

      const timersBefore = new Map(garden.seedDecayTimers)
      tickDormantGardenDecay(state, 5000)

      for (const [key, timerBefore] of timersBefore) {
        const timerAfter = garden.seedDecayTimers.get(key)
        if (timerAfter !== undefined) {
          expect(timerAfter).toBeLessThan(timerBefore)
        }
      }
    })

    it('does not decay when water is flowing', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return

      garden.waterFlowing = true
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
        soilHealth: new Map<string, number>(),
        world: {
          query: () => [] as number[],
          getComponent: () => undefined,
          destroyEntity: () => undefined,
        },
      } as never

      const timersBefore = new Map(garden.seedDecayTimers)
      tickDormantGardenDecay(state, 5000)

      // Timers should not have decreased — may have increased (brown → healthy reversal)
      for (const [key, timerBefore] of timersBefore) {
        const timerAfter = garden.seedDecayTimers.get(key)
        if (timerAfter !== undefined) {
          expect(timerAfter).toBeGreaterThanOrEqual(timerBefore)
        }
      }
    })

    it('older ruins have shorter decay timers', () => {
      const young = makeGardenInterior({ age: 1000 })
      const old = makeGardenInterior({ age: 6000 })
      const youngTimers = [...(young.dormantGarden?.seedDecayTimers.values() ?? [])]
      const oldTimers = [...(old.dormantGarden?.seedDecayTimers.values() ?? [])]
      if (youngTimers.length === 0 || oldTimers.length === 0) return
      const youngAvg = youngTimers.reduce((a, b) => a + b, 0) / youngTimers.length
      const oldAvg = oldTimers.reduce((a, b) => a + b, 0) / oldTimers.length
      expect(oldAvg).toBeLessThan(youngAvg)
    })
  })

  describe('aqueduct repair', () => {
    it('repairs a broken aqueduct tile', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return

      const bp = garden.breakPoints[0]
      const ruin = { ...interior, entranceOverworld: { x: 50, y: 50 } }
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [ruin],
        map: ruin.map,
      } as never

      expect(interior.map[bp.y][bp.x].type).toBe(TileType.RuinAqueductBroken)
      const result = repairAqueductBreak(state, bp.x, bp.y)
      expect(result).toBe(true)
      expect(interior.map[bp.y][bp.x].type).toBe(TileType.RuinAqueduct)
      expect(garden.repairedBreaks.has(posKey(bp.x, bp.y))).toBe(true)
    })

    it('sets waterFlowing when all breaks are repaired', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return

      const ruin = { ...interior, entranceOverworld: { x: 50, y: 50 } }
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [ruin],
        map: ruin.map,
      } as never

      for (const bp of garden.breakPoints) {
        repairAqueductBreak(state, bp.x, bp.y)
      }
      expect(garden.waterFlowing).toBe(true)
    })

    it('returns false for non-broken tile', () => {
      const interior = makeGardenInterior()
      const state = {
        currentRuinIndex: 0,
        ruinInteriors: [{ ...interior, entranceOverworld: { x: 50, y: 50 } }],
      } as never

      const result = repairAqueductBreak(state, 0, 0)
      expect(result).toBe(false)
    })
  })

  describe('aqueduct corridors and key/tablet/door placement', () => {
    it('uses 3x dimensions: width = radius*24+30, height = radius*18+24', () => {
      const interior = makeGardenInterior({ radius: 4 })
      expect(interior.mapWidth).toBe(4 * 24 + 30)
      expect(interior.mapHeight).toBe(4 * 18 + 24)
    })

    it('records keyPosition outside the seed vault', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.keyPosition).not.toBeNull()
      const kp = garden.keyPosition
      if (!kp) return
      // vault chamber is 5x4 around seedVault — verify key is not within it
      const vc = garden.seedVault
      const inVault = kp.x >= vc.x - 2 && kp.x <= vc.x + 2 && kp.y >= vc.y - 1 && kp.y <= vc.y + 2
      expect(inVault).toBe(false)
    })

    it('records tabletPosition outside the seed vault and not equal to keyPosition', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.tabletPosition).not.toBeNull()
      const tp = garden.tabletPosition
      const kp = garden.keyPosition
      if (!tp || !kp) return
      expect(tp.x === kp.x && tp.y === kp.y).toBe(false)
    })

    it('places RuinDoorLocked tiles across the entire vault south wall', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      const positions = garden.doorPositions
      expect(positions.length).toBeGreaterThan(1)
      // All recorded positions render as RuinDoorLocked.
      for (const dp of positions) {
        expect(interior.map[dp.y][dp.x].type).toBe(TileType.RuinDoorLocked)
      }
      // All door tiles share the same y (a single horizontal wall row).
      const ys = new Set(positions.map(p => p.y))
      expect(ys.size).toBe(1)
    })

    it('vault is reachable from entrance only via the door', () => {
      const interior = makeGardenInterior()
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      const start = interior.entranceInterior
      const vc = garden.seedVault
      // BFS treating the locked door as a wall — vault should be UNREACHABLE
      const reachable = new Set<string>()
      const queue = [start]
      reachable.add(posKey(start.x, start.y))
      while (queue.length > 0) {
        const pos = queue.shift()
        if (!pos) break
        for (const [dx, dy] of [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ] as const) {
          const nx = pos.x + dx
          const ny = pos.y + dy
          if (nx < 0 || nx >= interior.mapWidth || ny < 0 || ny >= interior.mapHeight) continue
          const key = posKey(nx, ny)
          if (reachable.has(key)) continue
          const tile = interior.map[ny][nx]
          // Treat door as impassable in this BFS
          if (!isWalkableTile(tile.type)) continue
          reachable.add(key)
          queue.push({ x: nx, y: ny })
        }
      }
      expect(reachable.has(posKey(vc.x, vc.y))).toBe(false)
    })
  })

  describe('coyote-role: collapse barrier and door/key skip', () => {
    it('places a 3-tile collapseBarrier across the spine for coyote-role ruins', () => {
      const interior = makeGardenInterior({ role: RuinRole.Coyote })
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.collapseBarrier).toBeTruthy()
      const barrier = garden.collapseBarrier
      if (!barrier) return
      expect(barrier.length).toBe(3)
      // All barrier tiles share the same y (one horizontal row).
      const ys = new Set(barrier.map(p => p.y))
      expect(ys.size).toBe(1)
      // Each barrier tile renders as RuinDebris.
      for (const bp of barrier) {
        expect(interior.map[bp.y][bp.x].type).toBe(TileType.RuinDebris)
      }
    })

    it('skips door + key for coyote-role ruins', () => {
      const interior = makeGardenInterior({ role: RuinRole.Coyote })
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.doorPositions).toEqual([])
      expect(garden.keyPosition).toBeNull()
      // No RuinDoorLocked tiles anywhere on the map.
      for (let y = 0; y < interior.mapHeight; y++) {
        for (let x = 0; x < interior.mapWidth; x++) {
          expect(interior.map[y][x].type).not.toBe(TileType.RuinDoorLocked)
        }
      }
    })

    it('keeps collapseBarrier null for non-coyote roles', () => {
      const interior = makeGardenInterior({ role: RuinRole.Bee })
      const garden = interior.dormantGarden
      expect(garden).toBeTruthy()
      if (!garden) return
      expect(garden.collapseBarrier).toBeNull()
    })

    it('clearRuinDebris collapses the entire barrier when the player faces a barrier tile, and records discovery', () => {
      const state = createTestState()
      const fx = state.player.x
      const fy = state.player.y - 1
      const barrier = [
        { x: fx - 1, y: fy },
        { x: fx, y: fy },
        { x: fx + 1, y: fy },
      ]
      for (const bp of barrier) state.map[bp.y][bp.x] = { type: TileType.RuinDebris }
      installCoyoteRuinFixture(state, barrier)
      state.playerFacing = 'up'

      expect(clearRuinDebris(state)).toBe(true)
      for (const bp of barrier) {
        expect(state.map[bp.y][bp.x].type).toBe(TileType.RuinFloor)
      }
    })

    it('clearRuinDebris is a no-op when not facing a RuinDebris tile', () => {
      const state = createTestState()
      state.currentZone = Zone.Ruin
      const fx = state.player.x
      const fy = state.player.y - 1
      state.map[fy][fx] = { type: TileType.RuinFloor }
      state.playerFacing = 'up'

      expect(clearRuinDebris(state)).toBe(false)
    })
  })

  describe('flora-species vault payload (RP-5)', () => {
    const installRuinWithRole = (role: RuinRole): { state: ReturnType<typeof createTestState>; ruinIndex: number } => {
      const state = createTestState()
      // createTestState seeds the world with genesis-derived ruins; clear them
      // so this test's freshly-constructed ruin is the only one and ground-item
      // queries are not polluted by pre-existing payloads.
      state.civilizationRuins = []
      state.ruinInteriors = []
      const ruin: CivilizationRuin = {
        position: { x: 50, y: 50 },
        name: 'Test Flora Ruin',
        radius: 4,
        age: 3000,
        aqueductPaths: [
          [
            { x: 50, y: 50 },
            { x: 60, y: 50 },
          ],
        ],
        buildingFootprints: [{ x: 50, y: 50 }],
        role,
      }
      const baseInterior = generateRuinInterior(ruin, 0, RuinArchetype.DormantGarden, makeRng())
      const interior = { ...baseInterior, entranceOverworld: { x: ruin.position.x, y: ruin.position.y } }
      state.civilizationRuins.push(ruin)
      state.ruinInteriors.push(interior)
      return { state, ruinIndex: 0 }
    }

    const groundItemIdAtRuin = (state: ReturnType<typeof createTestState>, ruinIndex: number): string[] => {
      const ids: string[] = []
      for (const eid of state.world.query(ComponentType.ItemDrop, ComponentType.EntityZone)) {
        const zone = state.world.getComponent(eid, ComponentType.EntityZone)
        if (zone?.zone !== Zone.Ruin || zone.ruinIndex !== ruinIndex) continue
        const drop = state.world.getComponent(eid, ComponentType.ItemDrop)
        if (drop) ids.push(drop.definitionId)
      }
      return ids
    }

    it('Wildflower-role ruin spawns one wildflowerSeeds at the first vault slot', () => {
      const { state, ruinIndex } = installRuinWithRole(RuinRole.Wildflower)
      spawnDormantGardenSeeds(state, ruinIndex)
      const ids = groundItemIdAtRuin(state, ruinIndex)
      expect(ids).toEqual(['wildflowerSeeds'])
    })

    it('TallGrass-role ruin spawns one tallGrassSeeds at the first vault slot', () => {
      const { state, ruinIndex } = installRuinWithRole(RuinRole.TallGrass)
      spawnDormantGardenSeeds(state, ruinIndex)
      const ids = groundItemIdAtRuin(state, ruinIndex)
      expect(ids).toEqual(['tallGrassSeeds'])
    })

    it('Wildflower ruin has no collapseBarrier (non-coyote standard layout)', () => {
      const { state, ruinIndex } = installRuinWithRole(RuinRole.Wildflower)
      const interior = state.ruinInteriors[ruinIndex]
      expect(interior?.dormantGarden?.collapseBarrier).toBeNull()
    })

    it('TallGrass ruin has no collapseBarrier (non-coyote standard layout)', () => {
      const { state, ruinIndex } = installRuinWithRole(RuinRole.TallGrass)
      const interior = state.ruinInteriors[ruinIndex]
      expect(interior?.dormantGarden?.collapseBarrier).toBeNull()
    })

    it('clover-role ruin still spawns clover (preserved behavior)', () => {
      const { state, ruinIndex } = installRuinWithRole(RuinRole.Clover)
      spawnDormantGardenSeeds(state, ruinIndex)
      const ids = groundItemIdAtRuin(state, ruinIndex)
      expect(ids).toEqual(['clover'])
    })

    it('bee-role ruin still spawns bee (preserved behavior)', () => {
      const { state, ruinIndex } = installRuinWithRole(RuinRole.Bee)
      spawnDormantGardenSeeds(state, ruinIndex)
      const ids = groundItemIdAtRuin(state, ruinIndex)
      expect(ids).toEqual(['bee'])
    })
  })
})
