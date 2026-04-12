import { generateBoltPath } from './boltPath'
import { addSoilHealth } from './cloverLifecycle'
import {
  LIGHTNING_BASE_CHANCE,
  LIGHTNING_BOLT_MAX_LENGTH,
  LIGHTNING_BOLT_MIN_LENGTH,
  LIGHTNING_DURATION_MS,
  LIGHTNING_ISOLATED_CLOVER_THRESHOLD,
  LIGHTNING_ISOLATED_RADIUS,
  LIGHTNING_MIN_PLAYER_DIST,
  LIGHTNING_NEAR_WATER_RADIUS,
  LIGHTNING_TARGET_SAMPLE_SIZE,
  LIGHTNING_WEIGHT_CLOVER,
  LIGHTNING_WEIGHT_ELEVATION,
  LIGHTNING_WEIGHT_ISOLATED,
  LIGHTNING_WEIGHT_METAL,
  LIGHTNING_WEIGHT_NEAR_WATER,
  LIGHTNING_WEIGHT_STRIKE_HISTORY,
  SOIL_HEALTH_FIRE_REVERY_BONUS,
  SPACE_BORDER,
  WATER_MAX,
  WILDFIRE_DRY_THRESHOLD,
  WILDFIRE_DURATION_MS,
  WILDFIRE_MAX_SPREAD,
} from './constants'
import { ComponentType } from './ecs/types'
import { recordDiscovery } from './manual'
import { CARDINAL, isInBounds, posKey } from './position'
import { Sky, TileType, Zone } from './types'

import type { GameState, Position } from './types'

export { generateBoltPath } from './boltPath'

// --- Weighted target selection ---

const isNearWater = (state: GameState, x: number, y: number): boolean => {
  const r = LIGHTNING_NEAR_WATER_RADIUS
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const key = posKey(x + dx, y + dy)
      if (state.ponds.has(key) || state.rivers.has(key)) return true
    }
  }
  return false
}

const isIsolatedFeature = (state: GameState, x: number, y: number): boolean => {
  const r = LIGHTNING_ISOLATED_RADIUS
  let total = 0
  let cloverCount = 0
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (!isInBounds(nx, ny, state.mapWidth, state.mapHeight)) continue
      total++
      if (state.map[ny][nx].type === TileType.Clover) cloverCount++
    }
  }
  return total > 0 && cloverCount / total < LIGHTNING_ISOLATED_CLOVER_THRESHOLD
}

export const selectStrikeTarget = (state: GameState, rng: () => number): Position | null => {
  // Pre-build metal positions set (ground omniboxes + ground meteorites)
  const metalPositions = new Set<string>()
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag === 'groundOmnibox' || tag === 'meteorite') {
      const pos = state.world.getComponent(eid, ComponentType.Position)
      if (pos) metalPositions.add(posKey(pos.x, pos.y))
    }
  }

  // Pre-build beehive positions set
  const beehivePositions = new Set<string>()
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'beehive') {
      const pos = state.world.getComponent(eid, ComponentType.Position)
      if (pos) beehivePositions.add(posKey(pos.x, pos.y))
    }
  }

  // Land bounds (inside space border)
  const minX = SPACE_BORDER
  const maxX = state.mapWidth - SPACE_BORDER - 1
  const minY = SPACE_BORDER
  const maxY = state.mapHeight - SPACE_BORDER - 1
  if (minX >= maxX || minY >= maxY) return null

  const candidates: { x: number; y: number; score: number }[] = []

  for (let i = 0; i < LIGHTNING_TARGET_SAMPLE_SIZE; i++) {
    const x = minX + Math.floor(rng() * (maxX - minX + 1))
    const y = minY + Math.floor(rng() * (maxY - minY + 1))

    // Reject invalid tiles
    const tile = state.map[y][x]
    if (
      tile.type === TileType.Space ||
      tile.type === TileType.Sand ||
      tile.type === TileType.CaveWall ||
      tile.type === TileType.CaveBreakableWall ||
      tile.type === TileType.CaveFloor ||
      tile.type === TileType.CaveEntrance
    ) {
      continue
    }

    // Reject water tiles
    const key = posKey(x, y)
    if (state.ponds.has(key) || state.rivers.has(key)) continue

    // Reject near player
    const pdx = Math.abs(x - state.player.x)
    const pdy = Math.abs(y - state.player.y)
    if (pdx + pdy < LIGHTNING_MIN_PLAYER_DIST) continue

    // Score the candidate
    let score = 1.0

    // Elevation factor
    const elevation = state.elevation.get(key) ?? 0
    score *= 1 + (elevation / 100) * LIGHTNING_WEIGHT_ELEVATION

    // Near-water factor
    if (isNearWater(state, x, y)) score *= LIGHTNING_WEIGHT_NEAR_WATER

    // Metal factor
    if (metalPositions.has(key)) {
      score *= LIGHTNING_WEIGHT_METAL
      // Omnibox strike history bonus
      for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
        const tag = state.world.getComponent(eid, ComponentType.EntityTag)
        if (tag === 'groundOmnibox') {
          const pos = state.world.getComponent(eid, ComponentType.Position)
          if (pos?.x === x && pos.y === y) {
            const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
            if (link) {
              const strikes = state.omniboxStrikeCounts.get(link.uid) ?? 0
              score *= 1 + strikes * LIGHTNING_WEIGHT_STRIKE_HISTORY
            }
            break
          }
        }
      }
    }

    // Isolated tall feature factor (beehives)
    if (beehivePositions.has(key) && isIsolatedFeature(state, x, y)) {
      score *= LIGHTNING_WEIGHT_ISOLATED
    }

    // Clover density factor
    if (tile.type === TileType.Clover) score *= LIGHTNING_WEIGHT_CLOVER

    candidates.push({ x, y, score })
  }

  if (candidates.length === 0) return null

  // Weighted random selection
  const totalScore = candidates.reduce((sum, c) => sum + c.score, 0)
  let roll = rng() * totalScore
  for (const c of candidates) {
    roll -= c.score
    if (roll <= 0) return { x: c.x, y: c.y }
  }

  // Fallback (shouldn't reach here, but satisfy the type)
  const last = candidates[candidates.length - 1]
  return { x: last.x, y: last.y }
}

// --- Wildfire spread ---

export const spreadWildfire = (
  state: GameState,
  strikeX: number,
  strikeY: number,
  maxSpread: number = WILDFIRE_MAX_SPREAD
): Set<string> => {
  const burned = new Set<string>()

  // Check if strike tile is clover
  if (state.map[strikeY][strikeX].type !== TileType.Clover) return burned
  const strikeKey = posKey(strikeX, strikeY)

  // Force origin tile water to 0 — fire/lightning always ignites the target
  state.tileWater.set(strikeKey, 0)

  // BFS spread
  const queue: { x: number; y: number }[] = [{ x: strikeX, y: strikeY }]

  while (queue.length > 0 && burned.size < maxSpread) {
    const pos = queue.shift()
    if (!pos) continue
    const key = posKey(pos.x, pos.y)
    if (burned.has(key)) continue
    if (!isInBounds(pos.x, pos.y, state.mapWidth, state.mapHeight)) continue
    if (state.map[pos.y][pos.x].type !== TileType.Clover) continue

    // Check water level (skip for origin which we already checked)
    if (key !== strikeKey) {
      const water = state.tileWater.get(key) ?? WATER_MAX
      if (water >= WILDFIRE_DRY_THRESHOLD) continue

      // Probabilistic spread based on dryness
      const spreadChance = (1 - water / WATER_MAX) * 0.6
      if (Math.random() < 1 - spreadChance) continue
    }

    // Burn this tile
    burned.add(key)
    state.map[pos.y][pos.x] = { type: TileType.BurntClover }
    state.cloverLifecycle.delete(key)
    state.cloverGrowthPreviews.delete(key)
    addSoilHealth(state, key, SOIL_HEALTH_FIRE_REVERY_BONUS)

    // Enqueue neighbors
    for (const dir of CARDINAL) {
      const nx = pos.x + dir.x
      const ny = pos.y + dir.y
      const nk = posKey(nx, ny)
      if (!burned.has(nk) && !state.ponds.has(nk) && !state.rivers.has(nk)) {
        queue.push({ x: nx, y: ny })
      }
    }
  }

  return burned
}

// --- Runtime spawn ---

export const spawnLightningStrike = (state: GameState, time: number): Position | null => {
  // Cooldown guard
  if (time < state.lightning.nextStrikeTime) return null

  // Weather probability
  const { sky, humidity, windSpeed } = state.weather
  const skyMult = sky === Sky.Rain ? 8 : sky === Sky.Cloudy ? 3 : 0.5
  const humidityMult = humidity / 100
  const windMult = windSpeed > 15 ? windSpeed / 25 : 1
  const chance = LIGHTNING_BASE_CHANCE * skyMult * humidityMult * windMult

  if (Math.random() >= chance) {
    // Failed the roll — still set cooldown so we don't check every tick
    state.lightning.nextStrikeTime = time + 15_000 + Math.random() * 15_000
    return null
  }

  // Find target
  const target = selectStrikeTarget(state, Math.random)
  if (!target) {
    state.lightning.nextStrikeTime = time + 15_000 + Math.random() * 15_000
    return null
  }

  // Generate bolt path
  const length =
    LIGHTNING_BOLT_MIN_LENGTH + Math.floor(Math.random() * (LIGHTNING_BOLT_MAX_LENGTH - LIGHTNING_BOLT_MIN_LENGTH + 1))
  const { path, branch } = generateBoltPath(target.x, target.y, length, Math.random)

  // Create lightning ECS entity
  const e = state.world.createEntity()
  state.world.addComponent(e, ComponentType.Position, { x: target.x, y: target.y })
  state.world.addComponent(e, ComponentType.TimedEffect, { kind: 'lightning', startTime: time })
  state.world.addComponent(e, ComponentType.LightningData, { path, branch })
  state.world.addComponent(e, ComponentType.EntityTag, 'lightning')
  state.world.addComponent(e, ComponentType.EntityZone, { zone: Zone.Overworld })

  // Update lightning state
  state.lightning.lastStrikeTime = time
  state.lightning.nextStrikeTime = time + 15_000 + Math.random() * 15_000

  // Record discovery
  recordDiscovery(state, 'event:lightning-strike')

  // Omnibox strike counter
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    if (state.world.getComponent(eid, ComponentType.EntityTag) === 'groundOmnibox') {
      const pos = state.world.getComponent(eid, ComponentType.Position)
      if (pos?.x === target.x && pos.y === target.y) {
        const link = state.world.getComponent(eid, ComponentType.OmniboxLink)
        if (link) {
          const current = state.omniboxStrikeCounts.get(link.uid) ?? 0
          state.omniboxStrikeCounts.set(link.uid, current + 1)
        }
        break
      }
    }
  }

  // Wildfire spread
  const burned = spreadWildfire(state, target.x, target.y)
  if (burned.size > 1) {
    const we = state.world.createEntity()
    state.world.addComponent(we, ComponentType.MultiPosition, {
      positions: [...burned].map(k => {
        const [xStr, yStr] = k.split(',')
        return { x: Number(xStr), y: Number(yStr) }
      }),
    })
    state.world.addComponent(we, ComponentType.TimedEffect, { kind: 'wildfire', startTime: time })
    state.world.addComponent(we, ComponentType.EntityTag, 'wildfire')
    state.world.addComponent(we, ComponentType.EntityZone, { zone: Zone.Overworld })
    recordDiscovery(state, 'event:wildfire')
  }

  return target
}

// --- Cleanup tick ---

export const tickLightning = (state: GameState, time: number): void => {
  for (const eid of state.world.query(ComponentType.TimedEffect, ComponentType.EntityTag)) {
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    const effect = state.world.getComponent(eid, ComponentType.TimedEffect)
    if (!effect) continue

    if (tag === 'lightning' && time - effect.startTime >= LIGHTNING_DURATION_MS) {
      state.world.destroyEntity(eid)
    } else if (tag === 'wildfire' && time - effect.startTime >= WILDFIRE_DURATION_MS) {
      state.world.destroyEntity(eid)
    }
  }
}
