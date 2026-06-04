import { RAIN_FRONT_WIDTH } from './constants'
import { ComponentType } from './ecs/types'
import { getFloraMovement } from './flora/actions/movement'
import { posKey } from './position'
import { rainFrontCoord, windToFrontAxis } from './tileWater'
import { Sky, Zone } from './types'

import type { GameState } from './types'

/** Spawn a pickupBloom timed effect at the given world position. */
export const spawnPickupBloom = (state: GameState, x: number, y: number, time: number): void => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'pickupBloom', startTime: time })
  state.world.addComponent(e, ComponentType.EntityTag, 'pickupBloom')
}

/** Spawn a click-target feedback marker at the destination tile of a click-to-move. */
export const spawnClickTarget = (state: GameState, x: number, y: number, time: number): void => {
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x, y })
  state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'clickTarget', startTime: time })
  state.world.addComponent(e, ComponentType.EntityTag, 'clickTarget')
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

  // Weather rain front (overworld only). Delegates to the rotated-frame
  // helpers in tileWater.ts (backlog-thinktank-v5 round 1) so the rain-aura
  // boundary is sourced from the same math as isInRainFront.
  if (state.weather.sky === Sky.Rain && zone === Zone.Overworld) {
    const { axis, sign } = windToFrontAxis(state.weather.windDirection)
    const { coord, mapSize } = rainFrontCoord(axis, x, y, state.overworldMapWidth, state.overworldMapHeight)
    const frontPos = (state.rainFrontOffset * sign + mapSize) % mapSize
    const dist = ((coord - frontPos) * sign + mapSize) % mapSize
    if (dist < RAIN_FRONT_WIDTH) {
      seen.add('rain')
    }
  }

  // Satellite impact effects
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
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

  // Wind sway (overworld only — clover or any flora tile with a registered movement profile)
  if (zone === Zone.Overworld && state.wind.smoothSpeed > 0.5) {
    const tile = state.map[y]?.[x]
    if (tile && getFloraMovement(tile.type)) {
      seen.add('swaying')
    }
  }

  // Pollen particles at this tile
  for (const p of state.pollen) {
    if (Math.round(p.x) === x && Math.round(p.y) === y) {
      seen.add('pollen')
      break
    }
  }

  // RP-9b — burn line membership. Locked is what Moab will walk
  // (or is walking) this Spring. The draft layer was removed in the
  // input-system-cleanup CR.
  if (zone === Zone.Overworld) {
    const key = posKey(x, y)
    if (state.lockedBurnLine?.some(p => posKey(p.x, p.y) === key)) {
      seen.add('burn line (locked)')
    }
  }

  return [...seen]
}
