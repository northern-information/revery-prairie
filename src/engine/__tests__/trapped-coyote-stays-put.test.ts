import { getCharacterDefinition } from '../characters'
import { transitionCoyoteToZone } from '../coyote'
import { ComponentType } from '../ecs/types'
import { RuinRole } from '../genesisTypes'
import { clearRuinDebris } from '../interaction'
import { movePlayer } from '../movement'
import { MainQuestPhase, RuinArchetype, TileType, Zone } from '../types'
import { getWorldForZone, moveEntityAcrossWorlds } from '../zone'
import { clearAroundPlayer, createCharacterTestEntity, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

import type { CivilizationRuin } from '../genesisTypes'
import type { GameState, RuinInterior } from '../types'

const requireValue = <T>(val: T | null | undefined): T => {
  expect(val).toBeTruthy()
  return val as T
}

interface CoyoteSnapshot {
  x: number
  y: number
  zone: Zone
  ruinIndex: number | undefined
}

// Find the coyote by iterating every world (the trapped-coyote tests
// transition the coyote across zones; the coyote may live in the ruin's
// world while state.world points to overworld, etc.).
const findCoyoteAcrossZones = (
  state: GameState
): { eid: number; zone: Zone; ruinIndex: number | undefined } | null => {
  for (const [key, world] of state.worlds) {
    for (const eid of world.query(ComponentType.CharacterIdentity)) {
      const identity = world.getComponent(eid, ComponentType.CharacterIdentity)
      if (identity?.definitionId !== 'coyote') continue
      // Decode the world key: 'ruin:N' or a bare Zone value.
      if (key.startsWith('ruin:')) {
        return { eid, zone: Zone.Ruin, ruinIndex: Number(key.slice('ruin:'.length)) }
      }
      return { eid, zone: key as Zone, ruinIndex: undefined }
    }
  }
  return null
}

const findCoyote = (state: GameState): number | null => {
  const hit = findCoyoteAcrossZones(state)
  return hit ? hit.eid : null
}

const getCoyote = (state: GameState): CoyoteSnapshot => {
  const hit = requireValue(findCoyoteAcrossZones(state))
  const world = state.worlds.get(hit.zone === Zone.Ruin ? `ruin:${String(hit.ruinIndex)}` : hit.zone)
  const pos = requireValue(world?.getComponent(hit.eid, ComponentType.Position))
  return { x: pos.x, y: pos.y, zone: hit.zone, ruinIndex: hit.ruinIndex }
}

describe('trapped coyote stays put on ruin entry', () => {
  it('does not teleport the trapped coyote adjacent to the player when awaiting-coyote', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    state.mainQuestPhase = MainQuestPhase.AwaitingCoyote
    state.currentZone = Zone.Ruin
    state.currentRuinIndex = 0

    // Trapped coyote spawned past the (notional) rubble — 5 tiles away.
    const trappedX = state.player.x + 5
    const trappedY = state.player.y
    state.map[trappedY][trappedX] = { type: TileType.RuinFloor }
    createCharacterTestEntity(state, 'coyote', trappedX, trappedY)

    transitionCoyoteToZone(state, Zone.Ruin)

    const coyote = getCoyote(state)
    expect(coyote.x).toBe(trappedX)
    expect(coyote.y).toBe(trappedY)
    // Not cardinally adjacent.
    const dx = Math.abs(coyote.x - state.player.x)
    const dy = Math.abs(coyote.y - state.player.y)
    expect(dx + dy).toBeGreaterThan(1)
    // Quest phase unchanged.
    expect(state.mainQuestPhase).toBe(MainQuestPhase.AwaitingCoyote)
  })

  it('does not drag the trapped coyote out to the overworld on ruin exit while awaiting-coyote', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    state.mainQuestPhase = MainQuestPhase.AwaitingCoyote
    // Caller (exitRuin) sets state.currentZone to Overworld before calling
    // transitionCoyoteToZone(state, Zone.Overworld). Coyote still has
    // EntityZone Ruin from its trapped spawn.
    state.currentZone = Zone.Overworld
    state.currentRuinIndex = null

    const trappedX = state.player.x + 5
    const trappedY = state.player.y
    // Place coyote directly into the ruin's world (matching what
    // spawnDormantGardenItems does — production routes the trapped coyote
    // into the ruin world via the opts.zone path).
    createCharacterTestEntity(state, 'coyote', trappedX, trappedY)
    // Move the coyote out of the overworld world (where the helper just
    // placed it) and into ruin:0's world, where spawnDormantGardenItems
    // would have put it.
    const overworldEid = requireValue(findCoyote(state))
    const overworld = getWorldForZone(state, Zone.Overworld)
    const ruinWorld = getWorldForZone(state, Zone.Ruin, 0)
    moveEntityAcrossWorlds(overworld, overworldEid, ruinWorld)

    transitionCoyoteToZone(state, Zone.Overworld)

    const coyote = getCoyote(state)
    expect(coyote.x).toBe(trappedX)
    expect(coyote.y).toBe(trappedY)
    expect(coyote.zone).toBe(Zone.Ruin)
    expect(coyote.ruinIndex).toBe(0)
  })

  it('still teleports a rescued coyote adjacent to the player across zone transitions', () => {
    const state = createTestState()
    clearAroundPlayer(state, 12)
    // Post-rescue: phase has advanced past AwaitingCoyote.
    state.mainQuestPhase = MainQuestPhase.Gathering
    state.currentZone = Zone.Cave
    state.currentRuinIndex = null

    // Companion coyote starts 8 tiles east of player.
    const startX = state.player.x + 8
    const startY = state.player.y
    createCharacterTestEntity(state, 'coyote', startX, startY, {
      behavior: { type: 'follow' },
    })

    transitionCoyoteToZone(state, Zone.Cave)

    const coyote = getCoyote(state)
    const dx = Math.abs(coyote.x - state.player.x)
    const dy = Math.abs(coyote.y - state.player.y)
    // Cardinally adjacent to player after the follow-transition.
    expect(dx + dy).toBe(1)
  })
})

const installCoyoteRuinWithBarrier = (state: GameState, barrier: { x: number; y: number }[]): void => {
  const ruin: CivilizationRuin = {
    position: { x: 0, y: 0 },
    name: 'Test Coyote Ruin',
    radius: 3,
    age: 1000,
    aqueductPaths: [],
    buildingFootprints: [],
    role: RuinRole.Coyote,
  }
  state.civilizationRuins = [ruin]
  state.currentRuinIndex = 0
  state.currentZone = Zone.Ruin

  const interior: RuinInterior = {
    ruinIndex: 0,
    archetype: RuinArchetype.DormantGarden,
    name: 'Test Coyote Ruin',
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
    floraMemory: new Map(),
  }
  state.ruinInteriors = [interior]
}

const countCrumbleEntities = (state: GameState): number => {
  let n = 0
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag === 'crumble') n++
  }
  return n
}

const countPickupBloomEntities = (state: GameState): number => {
  let n = 0
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag === 'pickupBloom') n++
  }
  return n
}

const findCrumbleEntity = (state: GameState): number | null => {
  for (const eid of state.world.query(ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'crumble') return eid
  }
  return null
}

describe('collapse barrier clears atomically', () => {
  it('clearing one collapseBarrier tile converts every barrier tile to RuinFloor', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.playerFacing = 'up'
    const fy = state.player.y - 1
    const barrier = [
      { x: state.player.x - 1, y: fy },
      { x: state.player.x, y: fy },
      { x: state.player.x + 1, y: fy },
    ]
    for (const bp of barrier) {
      state.map[bp.y][bp.x] = { type: TileType.RuinDebris }
    }
    installCoyoteRuinWithBarrier(state, barrier)

    expect(clearRuinDebris(state)).toBe(true)

    for (const bp of barrier) {
      expect(state.map[bp.y][bp.x].type).toBe(TileType.RuinFloor)
    }
  })

  it('atomic clear spawns a crumble TimedEffect entity covering the barrier tiles', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.playerFacing = 'up'
    const fy = state.player.y - 1
    const barrier = [
      { x: state.player.x - 1, y: fy },
      { x: state.player.x, y: fy },
      { x: state.player.x + 1, y: fy },
    ]
    for (const bp of barrier) {
      state.map[bp.y][bp.x] = { type: TileType.RuinDebris }
    }
    installCoyoteRuinWithBarrier(state, barrier)

    expect(countCrumbleEntities(state)).toBe(0)
    expect(clearRuinDebris(state)).toBe(true)
    expect(countCrumbleEntities(state)).toBe(1)

    const crumbleEid = requireValue(findCrumbleEntity(state))
    const mp = requireValue(state.world.getComponent(crumbleEid, ComponentType.MultiPosition))
    const keys = new Set(mp.positions.map(p => `${String(p.x)},${String(p.y)}`))
    for (const bp of barrier) {
      expect(keys.has(`${String(bp.x)},${String(bp.y)}`)).toBe(true)
    }
    const te = requireValue(state.world.getComponent(crumbleEid, ComponentType.TimedEffect))
    expect(te.kind).toBe('crumble')
  })

  it('atomic clear spawns a pickupBloom effect at the player position', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.playerFacing = 'up'
    const fy = state.player.y - 1
    const barrier = [
      { x: state.player.x - 1, y: fy },
      { x: state.player.x, y: fy },
      { x: state.player.x + 1, y: fy },
    ]
    for (const bp of barrier) {
      state.map[bp.y][bp.x] = { type: TileType.RuinDebris }
    }
    installCoyoteRuinWithBarrier(state, barrier)

    expect(countPickupBloomEntities(state)).toBe(0)
    expect(clearRuinDebris(state)).toBe(true)
    expect(countPickupBloomEntities(state)).toBe(1)

    // Locate the bloom and check its position equals the player position.
    let bloomEid: number | null = null
    for (const eid of state.world.query(ComponentType.EntityTag)) {
      if (state.world.getComponent(eid, ComponentType.EntityTag) === 'pickupBloom') {
        bloomEid = eid
        break
      }
    }
    const eid = requireValue(bloomEid)
    const pos = requireValue(state.world.getComponent(eid, ComponentType.Position))
    expect(pos.x).toBe(state.player.x)
    expect(pos.y).toBe(state.player.y)
  })

  it('partially pre-cleared barrier: remaining debris tiles all flip to RuinFloor in one call', () => {
    const state = createTestState()
    clearAroundPlayer(state, 8)
    state.playerFacing = 'up'
    const fy = state.player.y - 1
    const barrier = [
      { x: state.player.x - 1, y: fy },
      { x: state.player.x, y: fy },
      { x: state.player.x + 1, y: fy },
    ]
    // Pretend a fire revery already cleared the left barrier tile.
    state.map[barrier[0].y][barrier[0].x] = { type: TileType.RuinFloor }
    state.map[barrier[1].y][barrier[1].x] = { type: TileType.RuinDebris }
    state.map[barrier[2].y][barrier[2].x] = { type: TileType.RuinDebris }
    installCoyoteRuinWithBarrier(state, barrier)

    expect(clearRuinDebris(state)).toBe(true)
    for (const bp of barrier) {
      expect(state.map[bp.y][bp.x].type).toBe(TileType.RuinFloor)
    }
  })
})

describe('coyote character definition has placeholder awoo dialog', () => {
  it('coyote dialog is two awoo lines', () => {
    const def = getCharacterDefinition('coyote')
    expect(def.dialog).toEqual(['Awoo!', 'Awoo!'])
  })

  it('coyote glyph and color are unchanged', () => {
    const def = getCharacterDefinition('coyote')
    expect(def.glyph).toBe('C')
    expect(def.glyphColor).toBe('#D4A054')
  })
})

describe('rescue runs the coyote up to the player and auto-opens its dialog', () => {
  const setupRescueApproach = (state: GameState): void => {
    // Coyote-role ruin, walkable surround, coyote two tiles east — one
    // step right makes it cardinally adjacent so the post-step rescue hook fires.
    installCoyoteRuinWithBarrier(state, [])
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const x = state.player.x + dx
        const y = state.player.y + dy
        if (state.map[y]?.[x]) state.map[y][x] = { type: TileType.RuinFloor }
      }
    }
    // installCoyoteRuinWithBarrier above set currentZone=Ruin/index=0,
    // so the coyote routes into the ruin:0 world automatically.
    createCharacterTestEntity(state, 'coyote', state.player.x + 2, state.player.y)
  }

  it('opens the coyote activeDialog after the rescue fires', () => {
    const state = createTestState()
    setupRescueApproach(state)

    expect(state.activeDialog).toBeNull()
    expect(movePlayer(state, 'right')).toBe(true)

    expect(state.mainQuestPhase).toBe(MainQuestPhase.Gathering)
    const dialog = state.activeDialog
    expect(dialog).not.toBeNull()
    if (!dialog) return
    if (dialog.speakerKind !== 'character') throw new Error('expected character dialog')
    expect(dialog.characterId).toBe('coyote')
    expect(dialog.lineIndex).toBe(0)
    expect(dialog.typingIndex).toBe(0)
    expect(dialog.typingDone).toBe(false)
    expect(dialog.transitioning).toBe(false)
  })

  it('replaces any pre-existing activeDialog with the coyote descriptor', () => {
    const state = createTestState()
    setupRescueApproach(state)
    state.activeDialog = {
      speakerKind: 'character',
      characterId: 'gron',
      lineIndex: 2,
      typingIndex: 5,
      typingDone: true,
      transitioning: false,
      transitionStartTime: 0,
    }

    expect(movePlayer(state, 'right')).toBe(true)

    const dialog = state.activeDialog
    expect(dialog).not.toBeNull()
    if (!dialog) return
    expect(dialog.characterId).toBe('coyote')
    expect(dialog.lineIndex).toBe(0)
  })
})

