import {
  activateActionBarSlot,
  assignActionBarSlot,
  castLightningAtTarget,
  getTargetingPreview,
  isValidLightningTarget,
} from '../actionBar'
import {
  LIGHTNING_INVALID_TARGET_CHAR,
  LIGHTNING_INVALID_TARGET_COLOR,
  LIGHTNING_RETICLE_CHARS,
  LIGHTNING_REVERY_RANGE,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { posKey } from '../position'
import { getReveryDefinition, REVERY_DEFINITIONS } from '../reveries'
import { CloverStage, TileType } from '../types'
import { clearAroundPlayer, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

describe('lightning revery', () => {
  describe('definition', () => {
    it('exists in REVERY_DEFINITIONS', () => {
      expect(REVERY_DEFINITIONS.lightning).toBeDefined()
    })

    it('has castStyle targeted', () => {
      const def = getReveryDefinition('lightning')
      expect(def.castStyle).toBe('targeted')
    })

    it('has 15s cooldown', () => {
      const def = getReveryDefinition('lightning')
      expect(def.cooldownMs).toBe(15000)
    })

    it('has | glyph in white', () => {
      const def = getReveryDefinition('lightning')
      expect(def.glyphs).toEqual(['|'])
      expect(def.glyphColor).toBe('#FFFFFF')
    })
  })

  describe('isValidLightningTarget', () => {
    it('accepts dirt tiles within range', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 5, y: state.player.y + 5 }
      expect(isValidLightningTarget(state, target)).toBe(true)
    })

    it('rejects tiles beyond range', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + LIGHTNING_REVERY_RANGE + 1, y: state.player.y }
      expect(isValidLightningTarget(state, target)).toBe(false)
    })

    it('accepts tiles at exact range boundary', () => {
      const state = createTestState()
      clearAroundPlayer(state, LIGHTNING_REVERY_RANGE + 1)
      const target = { x: state.player.x + LIGHTNING_REVERY_RANGE, y: state.player.y }
      expect(isValidLightningTarget(state, target)).toBe(true)
    })

    it('rejects space tiles', () => {
      const state = createTestState()
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.map[target.y][target.x] = { type: TileType.Space }
      expect(isValidLightningTarget(state, target)).toBe(false)
    })

    it('accepts sand tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.map[target.y][target.x] = { type: TileType.Sand }
      expect(isValidLightningTarget(state, target)).toBe(true)
    })

    it('accepts water tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.ponds.add(posKey(target.x, target.y))
      expect(isValidLightningTarget(state, target)).toBe(true)
    })

    it('rejects tiles occupied by characters', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.CharacterIdentity, { definitionId: 'testGhost' })
      state.world.addComponent(eid, ComponentType.Position, { x: target.x, y: target.y })
      state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
      expect(isValidLightningTarget(state, target)).toBe(false)
    })

    it('rejects tiles occupied by bees', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.EntityTag, 'bee')
      state.world.addComponent(eid, ComponentType.Position, { x: target.x, y: target.y })
      state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
      expect(isValidLightningTarget(state, target)).toBe(false)
    })

    it('rejects tiles occupied by beehives', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.EntityTag, 'beehive')
      state.world.addComponent(eid, ComponentType.Position, { x: target.x, y: target.y })
      state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
      expect(isValidLightningTarget(state, target)).toBe(false)
    })

    it('rejects out of bounds', () => {
      const state = createTestState()
      expect(isValidLightningTarget(state, { x: -1, y: 0 })).toBe(false)
    })
  })

  describe('activateActionBarSlot with targeted revery', () => {
    it('returns false for targeted castStyle (does not cast immediately)', () => {
      const state = createTestState()
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      const result = activateActionBarSlot(state, 0, performance.now())
      expect(result).toBe(false)
    })
  })

  describe('castLightningAtTarget', () => {
    it('creates lightning ECS entity at target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      const target = { x: state.player.x + 5, y: state.player.y + 5 }

      const success = castLightningAtTarget(state, target, 0, 1000)
      expect(success).toBe(true)

      const lightningEntities = [...state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)].filter(
        eid => state.world.getComponent(eid, ComponentType.EntityTag) === 'lightning'
      )
      expect(lightningEntities.length).toBe(1)
    })

    it('sets cooldown on the slot', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      const target = { x: state.player.x + 5, y: state.player.y + 5 }

      castLightningAtTarget(state, target, 0, 1000)
      const slot = state.actionBar[0]
      expect(slot?.cooldownEndTime).toBeGreaterThan(1000)
      expect(slot?.cooldownDurationMs).toBe(15000)
    })

    it('clears targeting mode', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.targetingSlot = 0
      state.previewFn = () => []
      const target = { x: state.player.x + 5, y: state.player.y + 5 }

      castLightningAtTarget(state, target, 0, 1000)
      expect(state.targetingSlot).toBeNull()
      expect(state.previewFn).toBeNull()
    })

    it('rejects target out of range', () => {
      const state = createTestState()
      clearAroundPlayer(state, LIGHTNING_REVERY_RANGE + 2)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      const target = { x: state.player.x + LIGHTNING_REVERY_RANGE + 1, y: state.player.y }

      const success = castLightningAtTarget(state, target, 0, 1000)
      expect(success).toBe(false)
    })

    it('rejects when slot is on cooldown', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      const slot = state.actionBar[0]
      if (slot) slot.cooldownEndTime = 5000
      const target = { x: state.player.x + 5, y: state.player.y + 5 }

      const success = castLightningAtTarget(state, target, 0, 1000)
      expect(success).toBe(false)
    })

    it('triggers wildfire on dry clover', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      const tx = state.player.x + 5
      const ty = state.player.y + 5

      // Set up dry clover patch
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          state.map[ty + dy][tx + dx] = { type: TileType.Clover }
          state.cloverLifecycle.set(posKey(tx + dx, ty + dy), {
            stage: CloverStage.Healthy,
            stageStartTime: 0,
            hasLight: true,
          })
          state.tileWater.set(posKey(tx + dx, ty + dy), 0)
        }
      }

      castLightningAtTarget(state, { x: tx, y: ty }, 0, 1000)

      // At least the strike tile should be burned
      expect(state.map[ty][tx].type).toBe(TileType.BurntClover)
    })

    it('records lightning-revery discovery', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      const target = { x: state.player.x + 5, y: state.player.y + 5 }

      castLightningAtTarget(state, target, 0, 1000)
      expect(state.manualDiscoveries.has('event:lightning-revery')).toBe(true)
    })
  })

  describe('getTargetingPreview', () => {
    it('returns preview for valid cursor tile with animated reticle', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = { x: state.player.x + 5, y: state.player.y + 5 }

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(1)
      expect(LIGHTNING_RETICLE_CHARS).toContain(preview[0].char)
      expect(preview[0].color).toBe('#FFFFFF')
      expect(preview[0].isValid).toBe(true)
    })

    it('returns invalid preview for out-of-range cursor tile', () => {
      const state = createTestState()
      clearAroundPlayer(state, LIGHTNING_REVERY_RANGE + 2)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = { x: state.player.x + LIGHTNING_REVERY_RANGE + 1, y: state.player.y }

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(1)
      expect(preview[0].char).toBe(LIGHTNING_INVALID_TARGET_CHAR)
      expect(preview[0].color).toBe(LIGHTNING_INVALID_TARGET_COLOR)
      expect(preview[0].isValid).toBe(false)
    })

    it('returns empty when no cursor tile', () => {
      const state = createTestState()
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = null

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(0)
    })

    it('returns empty for non-targeted revery', () => {
      const state = createTestState()
      assignActionBarSlot(state, 0, 'revery', 'fire')
      state.cursorTile = { x: state.player.x + 3, y: state.player.y + 3 }

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(0)
    })
  })
})
