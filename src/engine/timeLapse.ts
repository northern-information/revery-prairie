// Time-lapse camera engine module (precis #23).
//
// The camera records sparse, event-driven "photographs" of its 3x3
// footprint. Each meaningful event (Pollination, Rain, Bloom, Ember,
// MonarchVisit, GhostPassage, EgregoreScan, CharacterApproach) that
// fires inside a placed camera's footprint advances film count by 1
// and appends a TimeLapseFrame snapshotting the 9 cells' {char, color}.
//
// Wear surface is film count only. The camera body is eternal but
// unreloadable — `state.cameraFilm` keying on uid means once a camera
// has any entry (including 0), the filmRoll+camera recipe is rejected
// in recipes.ts.

import {
  BEE_CHAR,
  BEE_COLOR,
  MONARCH_CHAR,
  MONARCH_COLOR,
  SEASONAL_PHASE_PERIOD_MS,
  TILE_CHARS,
  TILE_COLORS,
} from './constants'
import { sha256Sync } from './crypto'
import { ComponentType } from './ecs/types'
import { FLORA_SPECIES } from './flora/species'
import { isInBounds, isWalkableTile, posKey } from './position'
import { CameraSubject, TileType, Zone } from './types'

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
// Same cells + same subject + same timestamp → same identity → same
// gel pattern. The identity feeds GelBandView's hashToHexGrid for the
// 8x8 gel render. Per v4 R7 the gel is the photograph's visual
// register; the captured 3x3 cells live on the frame as the seed for
// the hash but are not displayed directly.
export const identityForFrame = (frame: TimeLapseFrame): string => {
  const cellsKey = frame.cells.map(c => `${c.char}${c.color}`).join('|')
  return sha256Sync(`photo:${frame.subject}:${String(frame.recordedAt)}:${cellsKey}`)
}

// Capture the 9-cell snapshot centered at (cx, cy). Used by
// recordCameraSubjectEvent and exposed for tests.
export const captureCells = (state: GameState, cx: number, cy: number): TimeLapseCell[] => {
  return FRAME_OFFSETS.map(({ dx, dy }) => resolveCellAt(state, cx + dx, cy + dy))
}

const overlapsFootprint = (camera: PlacedCamera, x: number, y: number): boolean => {
  return Math.abs(x - camera.x) <= 1 && Math.abs(y - camera.y) <= 1
}

// Engine-wide event sink. Call from each meaningful-event site (bee
// pollination, rain front, flora bloom, meteorite impact, monarch
// arrival, ghost passage, egregore advance, character approach).
// No-op when no camera covers (x, y), when film is exhausted, or when
// the camera's recording span has expired.
export const recordCameraSubjectEvent = (
  state: GameState,
  x: number,
  y: number,
  subject: CameraSubject,
  now: number
): void => {
  if (state.placedCameras.length === 0) return

  for (const camera of state.placedCameras) {
    if (camera.zone !== state.currentZone) continue
    if (!overlapsFootprint(camera, x, y)) continue
    if (now >= camera.expiresAt) continue
    const filmRemaining = state.cameraFilm.get(camera.uid) ?? 0
    if (filmRemaining <= 0) continue

    const frame: TimeLapseFrame = {
      recordedAt: now,
      subject,
      cells: captureCells(state, camera.x, camera.y),
    }
    camera.frames.push(frame)
    state.cameraFilm.set(camera.uid, filmRemaining - 1)
  }
}

// Move a PlacedCamera's frames into cameraArchive[uid] and remove the
// placedCameras entry. Caller is responsible for destroying the world
// entity. Used by pickup flows in interaction.ts.
export const archivePlacedCameraFrames = (state: GameState, camera: PlacedCamera): void => {
  const existing = state.cameraArchive.get(camera.uid) ?? []
  if (camera.frames.length > 0) {
    state.cameraArchive.set(camera.uid, [...existing, ...camera.frames])
  }
  const idx = state.placedCameras.indexOf(camera)
  if (idx >= 0) state.placedCameras.splice(idx, 1)
}

// Append a new PlacedCamera for a camera item being placed at (x, y).
// expiresAt is set to startedAt + SEASONAL_PHASE_PERIOD_MS / 4 when
// film remains; otherwise it equals startedAt so the placement
// records nothing.
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
    return { recordedAt, subject: CameraSubject.SeasonalLandmark, cells }
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
  state.world.addComponent(ce, ComponentType.EntityZone, { zone: Zone.Overworld })
  state.world.addComponent(ce, ComponentType.ItemDrop, { definitionId: 'camera' })
}
