import { RAIN_FRONT_WIDTH } from './constants'
import { ComponentType } from './ecs/types'
import { posKey } from './position'
import { getReveryDefinition } from './reveries'
import { Sky, WindDirection, Zone } from './types'

import type { GameState } from './types'

/** Spawn a pickupBloom timed effect at the given world position. */
export const spawnPickupBloom = (state: GameState, x: number, y: number, time: number): void => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'pickupBloom', startTime: time })
  state.world.addComponent(e, ComponentType.EntityTag, 'pickupBloom')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: state.currentZone })
}

export const AURA_RADIUS: Record<string, number> = {
  rain: 6,
  'angel-rain': 25,
  'angel-bees': 25,
  'angel-clover': 25,
}

export const getTileEffects = (state: GameState, x: number, y: number): string[] => {
  const seen = new Set<string>()
  const zone = state.currentZone

  // Aura effects (e.g. Gron's rain)
  for (const eid of state.world.query(ComponentType.Aura, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== zone) continue
    const aura = state.world.getComponent(eid, ComponentType.Aura)
    if (!aura) continue
    const r = aura.radius
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    const dx = x - pos.x
    const dy = y - pos.y
    if (dx * dx + dy * dy <= r * r) {
      seen.add(aura.kind)
    }
  }

  // Revery cast effects
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== zone) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'reveryCast') continue
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!effect?.reveryId) continue
    const multiPos = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (!multiPos) continue
    for (const pos of multiPos.positions) {
      if (pos.x === x && pos.y === y) {
        const def = getReveryDefinition(effect.reveryId)
        seen.add(def.name.toLowerCase())
        break
      }
    }
  }

  // Weather rain front (overworld only)
  if (state.weather.sky === Sky.Rain && zone === Zone.Overworld) {
    const windDir = state.weather.windDirection
    const frontAxis =
      windDir === WindDirection.N || windDir === WindDirection.S ? 'y' : 'x'
    const frontSign =
      windDir === WindDirection.N || windDir === WindDirection.W || windDir === WindDirection.NW || windDir === WindDirection.SW
        ? -1
        : 1
    const frontMapSize = frontAxis === 'x' ? state.overworldMapWidth : state.overworldMapHeight
    const frontPos = ((state.rainFrontOffset * frontSign) % frontMapSize + frontMapSize) % frontMapSize
    const coord = frontAxis === 'x' ? x : y
    const dist = ((coord - frontPos) * frontSign + frontMapSize) % frontMapSize
    if (dist < RAIN_FRONT_WIDTH) {
      seen.add('rain')
    }
  }

  // Satellite impact effects
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    if (state.world.getComponent(eid, ComponentType.EntityZone)?.zone !== zone) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag !== 'satelliteImpact') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    const dx = x - pos.x
    const dy = y - pos.y
    if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) {
      seen.add('satellite impact')
      break
    }
  }

  // Glinting zones (overworld only)
  if (zone === Zone.Overworld && state.glintZones.has(posKey(x, y))) {
    seen.add('glinting')
  }

  // Satellite craters (persistent pollution, overworld only)
  if (zone === Zone.Overworld && state.craters.has(posKey(x, y))) {
    seen.add('crater')
  }

  // Coyote mode indicator
  for (const eid of state.world.spatial.at(x, y)) {
    const identity = state.world.getComponent(eid, ComponentType.CharacterIdentity)
    if (identity?.definitionId === 'coyote') {
      seen.add(state.coyoteMode === 'follow' ? 'following' : 'collecting')
      break
    }
  }

  return [...seen]
}
