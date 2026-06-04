// Time-lapse camera engine module (precis #23, v11 R4 — diff-driven).
//
// The camera records change, not events. One sim-loop hook
// (`time-lapse-capture`, registered in src/engine/systems/flora.ts at
// CLOVER_LIFECYCLE_TICK_MS cadence) iterates every PlacedCamera in the
// current zone and asks `captureIfChanged` whether the live 3x3 cells
// diverged from the last committed frame. Divergence runs through a
// stable-for-N-ticks candidate buffer (STABILITY_THRESHOLD_TICKS, see
// constants.ts) to filter transient overlays — a bee crossing the
// footprint for one tick is not a photograph. A stable candidate
// commits as a new TimeLapseFrame and decrements cameraFilm by 1.
//
// Placement captures a baseline frame at time T when filmRemaining > 0,
// so every subsequent diff has something real to compare against.
// _Here is what was here when I started looking._
//
// Two wear surfaces (RP-15): film is the reloadable consumable
// (`state.cameraFilm`, keyed by uid — once a camera has any entry the
// filmRoll+camera recipe is rejected in recipes.ts), and body wear is
// permanent in v1 (`state.itemWear[uid]`, ticked here on archive by
// 1 / camera.maxUses, clamped to 1.0). Repair is deferred to a
// follow-up backlog item.

import {
  BEE_CHAR,
  BEE_COLOR,
  MONARCH_CHAR,
  MONARCH_COLOR,
  SEASONAL_PHASE_PERIOD_MS,
  STABILITY_THRESHOLD_TICKS,
  TILE_CHARS,
  TILE_COLORS,
} from './constants'
import { sha256Sync } from './crypto'
import { ComponentType } from './ecs/types'
import { FLORA_SPECIES } from './flora/species'
import { getDefinition } from './items'
import { isInBounds, isWalkableTile, posKey } from './position'
import { TileType, Zone } from './types'

import type { GameState, PlacedCamera, Position, TimeLapseCell, TimeLapseFrame } from './types'

const FRAME_OFFSETS: readonly { dx: number; dy: number }[] = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
] as const

const BLANK_CELL: TimeLapseCell = { char: ' ', color: '#000000' }

// Resolve the rendered {char, color} for a single tile, mirroring the
// world-tile render pass at a high level (tile base + flora overlay +
// entity overlay). Cursor highlight, fog mask, seasonal wash, and
// path overlay are intentionally NOT applied — a photograph captures
// what the camera "saw" of the prairie itself, not the player's HUD.
const resolveCellAt = (state: GameState, x: number, y: number): TimeLapseCell => {
  if (!isInBounds(x, y, state.mapWidth, state.mapHeight)) return BLANK_CELL

  const tile = state.map[y][x]
  let char = TILE_CHARS[tile.type]
  let color = TILE_COLORS[tile.type]

  // Flora overlay — same key the renderer uses.
  if (tile.type === TileType.Flora) {
    const lifecycle = state.floraLifecycle.get(posKey(x, y))
    if (lifecycle) {
      const def = FLORA_SPECIES[lifecycle.species]
      char = def.glyph
      color = def.color
    }
  }

  // Entity overlay — bee, monarch, ghost, character, placedCamera.
  // Iterating once is fine; 3x3 captures hit ~9 entity-bearing tiles
  // at most.
  for (const eid of state.world.query(ComponentType.EntityTag, ComponentType.Position)) {
    const pos = state.world.getComponent(eid, ComponentType.Position)
    if (pos?.x !== x || pos.y !== y) continue
    const tag = state.world.getComponent(eid, ComponentType.EntityTag)
    if (tag === 'bee') {
      char = BEE_CHAR
      color = BEE_COLOR
    } else if (tag === 'monarch') {
      char = MONARCH_CHAR
      color = MONARCH_COLOR
    }
    // Other tags (ghost, character, placedCamera, groundItem) fall back
    // to the tile/flora resolution above; specialized rendering for
    // those layers lives in renderer.ts and isn't reusable here without
    // factoring it out. Future spec can refine.
  }

  return { char, color }
}

// Derive a stable identity from a TimeLapseFrame's captured content.
// v11 R4 — subject is no longer recorded on frames, so the hash now
// keys on cells + timestamp only. Same cells + same timestamp → same
// identity. Used by the album panel's edge-code label.
export const identityForFrame = (frame: TimeLapseFrame): string => {
  const cellsKey = frame.cells.map(c => `${c.char}${c.color}`).join('|')
  return sha256Sync(`photo:${String(frame.recordedAt)}:${cellsKey}`)
}

// Capture the 9-cell snapshot centered at (cx, cy). Used by
// captureIfChanged and the baseline-frame path in createPlacedCamera.
export const captureCells = (state: GameState, cx: number, cy: number): TimeLapseCell[] => {
  return FRAME_OFFSETS.map(({ dx, dy }) => resolveCellAt(state, cx + dx, cy + dy))
}

// Cell-by-cell equality. Order-stable per FRAME_OFFSETS, so a
// straight zip-compare is sufficient.
const cellsEqual = (a: TimeLapseCell[], b: TimeLapseCell[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].char !== b[i].char || a[i].color !== b[i].color) return false
  }
  return true
}

// v11 R4 — diff-driven capture entry point. Called from the
// `time-lapse-capture` tick system (see src/engine/systems/flora.ts)
// once per camera per tick. No-op when the camera is cross-zone,
// expired, or out of film — and the candidate buffer is cleared in
// the no-op branch so a re-armed window doesn't inherit transient
// state.
//
// Algorithm (per spec `diff-stability-filter`):
//   - Let `next = captureCells(state, camera.x, camera.y)` and
//     `last = camera.frames[camera.frames.length - 1]?.cells`.
//   - If `last` exists and `next === last` (cell-equal), the change
//     reverted — clear any pending candidate, return.
//   - If `last` exists and `next !== last`:
//     * If no candidate is pending, record `next` as `pendingCells`
//       and set `pendingCount = 1`.
//     * Else if the candidate equals `next`, increment `pendingCount`.
//     * Else the candidate is stale (live cells diverged again before
//       stabilizing) — replace with `next`, reset `pendingCount = 1`.
//     * Once `pendingCount >= STABILITY_THRESHOLD_TICKS`, commit:
//       append `{ recordedAt: now, cells: pendingCells }` to
//       `camera.frames`, decrement `cameraFilm[uid]` by 1, and clear
//       the candidate buffer.
//   - If `last` does NOT exist (recording armed without a baseline —
//     can happen for the seeded predecessor where genesis pushed
//     archive frames but not placed.frames), the first observed
//     `next` is treated as the implicit baseline: it commits
//     immediately without going through the stability window. This
//     keeps the diff algorithm honest — every subsequent tick has a
//     real reference to compare against.
export const captureIfChanged = (state: GameState, camera: PlacedCamera, now: number): void => {
  // Gate: zone mismatch, expired window, or out of film → no-op.
  // Clear any in-flight candidate so a future re-arming doesn't
  // inherit a stale buffer (the witness paused; the candidate dies).
  if (camera.zone !== state.currentZone) {
    delete camera.pendingCells
    delete camera.pendingCount
    return
  }
  if (now >= camera.expiresAt) {
    delete camera.pendingCells
    delete camera.pendingCount
    return
  }
  const filmRemaining = state.cameraFilm.get(camera.uid) ?? 0
  if (filmRemaining <= 0) {
    delete camera.pendingCells
    delete camera.pendingCount
    return
  }

  const next = captureCells(state, camera.x, camera.y)
  const last = camera.frames.length > 0 ? camera.frames[camera.frames.length - 1].cells : null

  // Edge case: recording armed without a baseline (placement path that
  // didn't capture one, e.g. zero-frame seeded predecessor that later
  // gets refilled). First observed cells become the implicit baseline.
  if (last === null) {
    camera.frames.push({ recordedAt: now, cells: next })
    state.cameraFilm.set(camera.uid, filmRemaining - 1)
    delete camera.pendingCells
    delete camera.pendingCount
    return
  }

  if (cellsEqual(next, last)) {
    // Regressed back to baseline — the candidate did not stabilize.
    delete camera.pendingCells
    delete camera.pendingCount
    return
  }

  // Live cells differ from the last committed frame. Run the
  // stable-for-N-ticks candidate buffer.
  const pending = camera.pendingCells
  if (!pending) {
    camera.pendingCells = next
    camera.pendingCount = 1
  } else if (cellsEqual(next, pending)) {
    camera.pendingCount = (camera.pendingCount ?? 0) + 1
  } else {
    // Live cells changed mid-stabilization — restart with the new
    // candidate. Falling all the way back to baseline is handled by
    // the cellsEqual(next, last) branch above; here we know
    // next !== last AND next !== pending.
    camera.pendingCells = next
    camera.pendingCount = 1
  }

  if ((camera.pendingCount ?? 0) >= STABILITY_THRESHOLD_TICKS) {
    const committed = camera.pendingCells
    if (committed) {
      camera.frames.push({ recordedAt: now, cells: committed })
      state.cameraFilm.set(camera.uid, filmRemaining - 1)
    }
    delete camera.pendingCells
    delete camera.pendingCount
  }
}

// Sim-loop hook. Registered in src/engine/systems/flora.ts as
// `time-lapse-capture`. Iterates every PlacedCamera in the current
// zone and runs the diff filter; cross-zone cameras are skipped
// internally (captureIfChanged handles the zone gate).
export const tickTimeLapseCapture = (state: GameState, time: number): void => {
  if (state.placedCameras.length === 0) return
  for (const camera of state.placedCameras) {
    captureIfChanged(state, camera, time)
  }
}

// Move a PlacedCamera's frames into cameraArchive[uid] and remove the
// placedCameras entry. Caller is responsible for destroying the world
// entity. Used by pickup flows in interaction.ts. Any in-flight
// candidate buffer is discarded — it never committed, so it never
// existed for the album's purposes.
export const archivePlacedCameraFrames = (state: GameState, camera: PlacedCamera): void => {
  const existing = state.cameraArchive.get(camera.uid) ?? []
  if (camera.frames.length > 0) {
    state.cameraArchive.set(camera.uid, [...existing, ...camera.frames])
  }
  tickBodyWear(state, camera.uid, 'camera')
  const idx = state.placedCameras.indexOf(camera)
  if (idx >= 0) state.placedCameras.splice(idx, 1)
}

// RP-15. Increment body wear for the given item uid by 1 / maxUses,
// clamped to 1.0. No-op when the definition has no maxUses or a
// non-positive maxUses — wear-free items never accrue wear.
const tickBodyWear = (state: GameState, uid: string, definitionId: string): void => {
  const def = getDefinition(definitionId)
  const maxUses = def.maxUses
  if (!maxUses || maxUses <= 0) return
  const current = state.itemWear[uid] ?? 0
  state.itemWear[uid] = Math.min(1, current + 1 / maxUses)
}

// Append a new PlacedCamera for a camera item being placed at (x, y).
// expiresAt is set to startedAt + SEASONAL_PHASE_PERIOD_MS / 4 when
// film remains; otherwise it equals startedAt so the placement
// records nothing.
//
// v11 R4 — when filmRemaining > 0, a baseline frame is captured at
// placement: `captureCells(state, x, y)` runs once, a TimeLapseFrame
// with `recordedAt = now` is pushed onto `placed.frames`, and
// `cameraFilm[uid]` decrements by 1. The baseline counts as the
// first detected change — it gives every subsequent diff something
// real to compare against and reads as the camera saying _here is
// what was here when I started looking._
export interface PlacementOptions {
  uid: string
  x: number
  y: number
  zone: PlacedCamera['zone']
  ruinIndex?: number
  now: number
  spanMs: number
}

export const createPlacedCamera = (state: GameState, opts: PlacementOptions): PlacedCamera => {
  const filmRemaining = state.cameraFilm.get(opts.uid) ?? 0
  const placed: PlacedCamera = {
    uid: opts.uid,
    x: opts.x,
    y: opts.y,
    zone: opts.zone,
    startedAt: opts.now,
    expiresAt: filmRemaining > 0 ? opts.now + opts.spanMs : opts.now,
    frames: [],
  }
  if (opts.ruinIndex !== undefined) placed.ruinIndex = opts.ruinIndex

  // Baseline frame at placement (when armed). The baseline is a real
  // frame on the roll and consumes one film unit.
  if (filmRemaining > 0) {
    const baselineCells = captureCells(state, opts.x, opts.y)
    placed.frames.push({ recordedAt: opts.now, cells: baselineCells })
    state.cameraFilm.set(opts.uid, filmRemaining - 1)
  }
  return placed
}

// Precis #23 v9 R3 — spawn one Field Camera in the overworld, already
// deployed, adjacent to the oak nearest the little house entrance,
// with an exhausted film body (cameraFilm = 0) and four pre-seeded
// frames of that oak across spring / summer / autumn / winter. Must
// be called AFTER seedOaks has populated the overworld oaks.
const SEASONAL_OAK_PALETTE = {
  spring: { canopy: '#9CC34A', trunk: '#6B4423' },
  summer: { canopy: '#5A7A3A', trunk: '#6B4423' },
  autumn: { canopy: '#C8843A', trunk: '#6B4423' },
  winter: { canopy: '#7A5A3A', trunk: '#4A2E18' },
} as const

const FRAME_OFFSETS_3X3: readonly { dx: number; dy: number }[] = [
  { dx: -1, dy: -1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 0 },
  { dx: 1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: 1 },
] as const

export const seedTenureStartFieldCamera = (state: GameState): void => {
  // Find every oak's anchor + body in the overworld.
  const oaks: { anchor: Position; body: Set<string> }[] = []
  for (const eid of state.world.query(ComponentType.OakData, ComponentType.MultiPosition)) {
    const anchor = state.world.getComponent(eid, ComponentType.Position)
    const multi = state.world.getComponent(eid, ComponentType.MultiPosition)
    if (!anchor || !multi) continue
    const body = new Set(multi.positions.map(p => posKey(p.x, p.y)))
    oaks.push({ anchor, body })
  }
  if (oaks.length === 0) return

  // Pick the oak with minimum Chebyshev distance to the house entrance.
  // Tie-break: lower-y, then lower-x.
  const entrance = state.houseEntranceOverworld
  const cheby = (a: Position, b: Position): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
  oaks.sort((a, b) => {
    const da = cheby(a.anchor, entrance)
    const db = cheby(b.anchor, entrance)
    if (da !== db) return da - db
    if (a.anchor.y !== b.anchor.y) return a.anchor.y - b.anchor.y
    return a.anchor.x - b.anchor.x
  })
  const nearestOak = oaks[0]

  // Pick the walkable tile adjacent to the oak body (within
  // Chebyshev 3 of the anchor, since the oak is 5x5) closest to the
  // house entrance. Skip tiles that are themselves an oak body.
  const oakBodies = new Set<string>()
  for (const o of oaks) for (const k of o.body) oakBodies.add(k)
  const ring: Position[] = []
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = nearestOak.anchor.x + dx
      const y = nearestOak.anchor.y + dy
      if (!isInBounds(x, y, state.overworldMapWidth, state.overworldMapHeight)) continue
      const k = posKey(x, y)
      if (oakBodies.has(k)) continue
      if (!isWalkableTile(state.overworldMap[y][x].type)) continue
      ring.push({ x, y })
    }
  }
  if (ring.length === 0) return

  ring.sort((a, b) => {
    const da = cheby(a, entrance)
    const db = cheby(b, entrance)
    if (da !== db) return da - db
    if (a.y !== b.y) return a.y - b.y
    return a.x - b.x
  })
  const placementTile = ring[0]

  // Capture the camera's 3x3 footprint against the overworld map.
  // state may still be in another zone when this is called from
  // completeGenesis — pass a shimmed state with the overworld map
  // active so captureCells reads the right tiles.
  const overworldState = {
    ...state,
    map: state.overworldMap,
    mapWidth: state.overworldMapWidth,
    mapHeight: state.overworldMapHeight,
    currentZone: Zone.Overworld,
  } as GameState
  const baseline = captureCells(overworldState, placementTile.x, placementTile.y)

  // v11 R4 — the `subject` field retires from TimeLapseFrame; the four
  // pre-seeded frames keep their cells payload (with the seasonal
  // palette override) and a quarter-year timestamp apart.
  const buildSeasonFrame = (season: 'spring' | 'summer' | 'autumn' | 'winter', recordedAt: number): TimeLapseFrame => {
    const palette = SEASONAL_OAK_PALETTE[season]
    const cells = baseline.map((cell, idx) => {
      const off = FRAME_OFFSETS_3X3[idx]
      const cellKey = posKey(placementTile.x + off.dx, placementTile.y + off.dy)
      if (!nearestOak.body.has(cellKey)) return cell
      // Oak-body cell: substitute color based on glyph register.
      // Trunk glyphs in the oak renderer are '|' and bark chars;
      // canopy glyphs are '&' and '#'.
      const isTrunk = cell.char === '|' || cell.char === 'T'
      return { char: cell.char, color: isTrunk ? palette.trunk : palette.canopy }
    })
    return { recordedAt, cells }
  }

  const quarterMs = SEASONAL_PHASE_PERIOD_MS / 4
  const cameraUid = crypto.randomUUID()
  const frames: TimeLapseFrame[] = [
    buildSeasonFrame('spring', 0),
    buildSeasonFrame('summer', quarterMs),
    buildSeasonFrame('autumn', quarterMs * 2),
    buildSeasonFrame('winter', quarterMs * 3),
  ]

  state.cameraFilm.set(cameraUid, 0)
  state.cameraArchive.set(cameraUid, frames)

  const placed: PlacedCamera = {
    uid: cameraUid,
    x: placementTile.x,
    y: placementTile.y,
    zone: Zone.Overworld,
    startedAt: 0,
    expiresAt: 0,
    frames: [],
  }
  state.placedCameras.push(placed)

  const ce = state.world.createEntity()
  state.world.addComponent(ce, ComponentType.Position, { x: placementTile.x, y: placementTile.y })
  state.world.addComponent(ce, ComponentType.EntityTag, 'placedCamera')
  state.world.addComponent(ce, ComponentType.ItemDrop, { definitionId: 'camera' })
}
