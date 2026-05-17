import { assignActionBarSlot, getTargetingPreview, isValidLightningTarget } from '../actionBar'
import {
  LIGHTNING_INVALID_TARGET_CHAR,
  LIGHTNING_INVALID_TARGET_COLOR,
  LIGHTNING_RETICLE_CHARS,
  LIGHTNING_RETICLE_CYCLE_MS,
  LIGHTNING_REVERY_RANGE,
} from '../constants'
import { ComponentType } from '../ecs/types'
import { posKey } from '../position'
import { TileType } from '../types'
import { clearAroundPlayer, createBeeEntity, createBeehiveEntity, createTestState } from './helpers'
import { describe, expect, it } from 'vitest'

describe('lightning targeting visuals', () => {
  describe('animated reticle', () => {
    it('cycles through reticle chars based on time', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = { x: state.player.x + 3, y: state.player.y + 3 }

      const chars = new Set<string>()
      for (let i = 0; i < LIGHTNING_RETICLE_CHARS.length; i++) {
        const time = i * LIGHTNING_RETICLE_CYCLE_MS
        const preview = getTargetingPreview(state, 0, time)
        expect(preview).toHaveLength(1)
        expect(preview[0].isValid).toBe(true)
        chars.add(preview[0].char)
      }
      expect(chars.size).toBe(LIGHTNING_RETICLE_CHARS.length)
      for (const c of LIGHTNING_RETICLE_CHARS) {
        expect(chars.has(c)).toBe(true)
      }
    })

    it('wraps around after cycling through all chars', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = { x: state.player.x + 3, y: state.player.y + 3 }

      const first = getTargetingPreview(state, 0, 0)
      const wrapped = getTargetingPreview(state, 0, LIGHTNING_RETICLE_CYCLE_MS * LIGHTNING_RETICLE_CHARS.length)
      expect(first[0].char).toBe(wrapped[0].char)
    })
  })

  describe('invalid target visuals', () => {
    it('returns red X for space tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.map[target.y][target.x] = { type: TileType.Space }
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = target

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(1)
      expect(preview[0].char).toBe(LIGHTNING_INVALID_TARGET_CHAR)
      expect(preview[0].color).toBe(LIGHTNING_INVALID_TARGET_COLOR)
      expect(preview[0].isValid).toBe(false)
    })

    it('returns red X for character-occupied tiles', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.CharacterIdentity, { definitionId: 'testChar' })
      state.world.addComponent(eid, ComponentType.Position, { x: target.x, y: target.y })
      state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = target

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(1)
      expect(preview[0].char).toBe(LIGHTNING_INVALID_TARGET_CHAR)
      expect(preview[0].isValid).toBe(false)
    })
  })

  describe('entity blocking', () => {
    it('character blocks targeting', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 5, y: state.player.y + 5 }
      const eid = state.world.createEntity()
      state.world.addComponent(eid, ComponentType.CharacterIdentity, { definitionId: 'ghost1' })
      state.world.addComponent(eid, ComponentType.Position, { x: target.x, y: target.y })
      state.world.addComponent(eid, ComponentType.EntityZone, { zone: state.currentZone })
      expect(isValidLightningTarget(state, target)).toBe(false)
    })

    it('bee blocks targeting', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 5, y: state.player.y + 5 }
      createBeeEntity(state, target.x, target.y)
      expect(isValidLightningTarget(state, target)).toBe(false)
    })

    it('beehive blocks targeting', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 5, y: state.player.y + 5 }
      createBeehiveEntity(state, target.x, target.y)
      expect(isValidLightningTarget(state, target)).toBe(false)
    })

    it('ignores entities in different zone', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      const target = { x: state.player.x + 5, y: state.player.y + 5 }
      // Spawn a bee in the cave zone while player is in overworld
      createBeeEntity(state, target.x, target.y, 'cave')
      expect(isValidLightningTarget(state, target)).toBe(true)
    })
  })

  describe('terrain validity changes', () => {
    it('sand is valid target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.map[target.y][target.x] = { type: TileType.Sand }
      expect(isValidLightningTarget(state, target)).toBe(true)
    })

    it('pond is valid target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.ponds.add(posKey(target.x, target.y))
      expect(isValidLightningTarget(state, target)).toBe(true)
    })

    it('cave wall is valid target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.map[target.y][target.x] = { type: TileType.CaveWall }
      expect(isValidLightningTarget(state, target)).toBe(true)
    })

    it('cave entrance is valid target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.map[target.y][target.x] = { type: TileType.CaveEntrance }
      expect(isValidLightningTarget(state, target)).toBe(true)
    })

    it('river is valid target', () => {
      const state = createTestState()
      clearAroundPlayer(state, 5)
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.rivers.add(posKey(target.x, target.y))
      expect(isValidLightningTarget(state, target)).toBe(true)
    })
  })

  describe('preview isValid flag', () => {
    it('valid target includes isValid true', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = { x: state.player.x + 3, y: state.player.y + 3 }

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(1)
      expect(preview[0].isValid).toBe(true)
    })

    it('invalid target includes isValid false', () => {
      const state = createTestState()
      clearAroundPlayer(state, 10)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      const target = { x: state.player.x + 3, y: state.player.y + 3 }
      state.map[target.y][target.x] = { type: TileType.Space }
      state.cursorTile = target

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(1)
      expect(preview[0].isValid).toBe(false)
    })

    it('out of range target returns invalid preview', () => {
      const state = createTestState()
      clearAroundPlayer(state, LIGHTNING_REVERY_RANGE + 5)
      assignActionBarSlot(state, 0, 'revery', 'lightning')
      state.cursorTile = { x: state.player.x + LIGHTNING_REVERY_RANGE + 1, y: state.player.y }

      const preview = getTargetingPreview(state, 0, 0)
      expect(preview).toHaveLength(1)
      expect(preview[0].isValid).toBe(false)
      expect(preview[0].char).toBe(LIGHTNING_INVALID_TARGET_CHAR)
    })
  })
})
