// Precis #4 — omen detection.
//
// Three omen variants schedule the Revery when world conditions align:
//   (a) bee on shoulder — a bee entity steps onto the player's tile
//   (b) distant meteorite — a shooting star's projected landing is within
//       Chebyshev distance 3 of the player
//   (c) cloud passing the sun — sky transitions from Rain/Cloudy to Sun while
//       the player has been stationary for REVERY_OMEN_STATIONARY_MS
//
// All gates that block detection (active Revery / deep time / wrong zone /
// wrong season / cooldown) are checked centrally at the top of detectOmen.
//
// See harness/specs/precis-4-the-revery.yaml omen-detection behavior.

import { REVERY_COOLDOWN_MS, REVERY_OMEN_STATIONARY_MS } from './constants'
import { ComponentType } from './ecs/types'
import { OmenKind, Season, Sky, Zone } from './types'

import type { GameState, OmenKind as OmenKindT } from './types'

const OMEN_METEORITE_CHEBYSHEV = 3

const chebyshev = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(Math.abs(ax - bx), Math.abs(ay - by))

const skyWasCloudOrRain = (sky: Sky): boolean => sky === Sky.Rain || sky === Sky.Cloudy

export const detectOmen = (state: GameState, time: number): OmenKindT | null => {
  // Gate: already running, deep time, wrong zone, wrong season, or cooldown.
  if (state.revery) return null
  if (state.deepTime?.active) return null
  if (state.currentZone !== Zone.Overworld) return null
  if (state.weather.season !== Season.Autumn) return null
  if (time - state.lastReveryEndTime < REVERY_COOLDOWN_MS) return null

  // (a) Bee on shoulder.
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) !== 'bee') continue
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (!pos) continue
    if (pos.x === state.player.x && pos.y === state.player.y) return OmenKind.BeeOnShoulder
  }

  // (b) Distant meteorite. A shooting star with a projected landing.
  for (const eid of state.world.query(ComponentType.ShootingStarData)) {
    const data = state.world.getComponent(eid, ComponentType.ShootingStarData)
    if (!data || !data.willLand || !data.landingTarget) continue
    const d = chebyshev(data.landingTarget.x, data.landingTarget.y, state.player.x, state.player.y)
    if (d <= OMEN_METEORITE_CHEBYSHEV) return OmenKind.DistantMeteorite
  }

  // (c) Cloud passing the sun. Rain/Cloudy → Sun transition while stationary.
  if (
    skyWasCloudOrRain(state.lastSky) &&
    state.weather.sky === Sky.Sun &&
    time - state.playerStationarySince >= REVERY_OMEN_STATIONARY_MS
  ) {
    return OmenKind.CloudPassingSun
  }

  return null
}
