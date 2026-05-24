// RP-18 — Stone circles and hallowed ground.
//
// Pure math over state.placedMeteorites. No RNG. The functions here
// produce the proximity graph, find chordless polygons, and answer
// point-in-polygon queries. Renderer, egregore spread, and the manual
// discovery hook all consume these — see harness/specs/RP-18-stone-
// circles.yaml.
//
// Containment model: per-source. The egregore-spread filter compares
// containingPolygonsKey at source and candidate; tiles only spread within
// the same polygon-membership set. The polygon is a fence in both
// directions — inside flora stays inside, outside flora stays outside.

import { STONE_CIRCLE_RADIUS } from './constants'

import type { GameState, Position } from './types'

export interface StoneCircleEdge {
  aIndex: number
  bIndex: number
}

// All pairs of placed meteorites within STONE_CIRCLE_RADIUS (Euclidean).
// Edges are returned with aIndex < bIndex, sorted by (aIndex, bIndex)
// ascending — the double loop already produces this order.
export const getStoneCircleGraph = (placed: readonly Position[]): StoneCircleEdge[] => {
  const edges: StoneCircleEdge[] = []
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const dx = placed[i].x - placed[j].x
      const dy = placed[i].y - placed[j].y
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d <= STONE_CIRCLE_RADIUS) edges.push({ aIndex: i, bIndex: j })
    }
  }
  return edges
}

const buildAdjacency = (n: number, edges: readonly StoneCircleEdge[]): number[][] => {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const e of edges) {
    adj[e.aIndex].push(e.bIndex)
    adj[e.bIndex].push(e.aIndex)
  }
  for (const list of adj) list.sort((a, b) => a - b)
  return adj
}

const hasEdge = (adj: readonly (readonly number[])[], a: number, b: number): boolean => adj[a].includes(b)

// A cycle is chordless when no two non-adjacent ring vertices share an
// edge. Adjacency in the ring includes the wrap-around pair (last, first).
const isChordless = (cycle: readonly number[], adj: readonly (readonly number[])[]): boolean => {
  const n = cycle.length
  if (n < 4) return true
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      if (hasEdge(adj, cycle[i], cycle[j])) return false
    }
  }
  return true
}

// Rotate so smallest index is first; choose direction so the second
// vertex is the smaller of the two adjacent neighbors. Produces a stable
// key for deduping equivalent traversals (forward + reverse).
const canonicalForm = (cycle: readonly number[]): number[] => {
  let minIdx = 0
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIdx]) minIdx = i
  }
  const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)]
  if (rotated[1] > rotated[rotated.length - 1]) {
    return [rotated[0], ...rotated.slice(1).reverse()]
  }
  return rotated
}

// Shoelace signed area. Returns 0 for collinear (degenerate) rings.
const signedArea = (vertices: readonly Position[]): number => {
  let area = 0
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y
  }
  return area / 2
}

// Enumerate chordless cycles in the proximity graph. Each cycle is
// returned as a vertex-index ring (length >= 3), canonicalized so that
// equivalent rings (rotations + reverses) dedupe to one entry. Zero-area
// (collinear) rings are filtered out — they cannot enclose any tile.
// Output is sorted by (length, lex order of indices) for determinism.
export const getHallowedPolygons = (
  placed: readonly Position[],
  edges: readonly StoneCircleEdge[]
): number[][] => {
  if (placed.length < 3) return []
  const adj = buildAdjacency(placed.length, edges)
  const cycles = new Map<string, number[]>()

  const dfs = (start: number, current: number, path: number[], visited: Set<number>): void => {
    for (const next of adj[current]) {
      if (next === start && path.length >= 3) {
        const cycle = canonicalForm(path)
        const key = cycle.join(',')
        if (!cycles.has(key) && isChordless(cycle, adj)) {
          const verts = cycle.map(i => placed[i])
          if (signedArea(verts) !== 0) {
            cycles.set(key, cycle)
          }
        }
      } else if (next > start && !visited.has(next)) {
        visited.add(next)
        path.push(next)
        dfs(start, next, path, visited)
        path.pop()
        visited.delete(next)
      }
    }
  }

  for (let v = 0; v < placed.length; v++) {
    const visited = new Set<number>([v])
    dfs(v, v, [v], visited)
  }

  return [...cycles.values()].sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
    return 0
  })
}

// Standard ray-casting point-in-polygon. The point is the tile center
// (x + 0.5, y + 0.5) to avoid boundary ambiguity on integer coordinates.
const pointInPolygon = (px: number, py: number, ring: readonly Position[]): boolean => {
  let inside = false
  const n = ring.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i].x
    const yi = ring[i].y
    const xj = ring[j].x
    const yj = ring[j].y
    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

// True iff any polygon's interior contains (x + 0.5, y + 0.5). Returns
// false when no polygons exist. State-derived: recomputes the polygon
// set on each call. Callers that need to check many tiles in a hot loop
// should compute the polygon set once and use pointInPolygonForPolygons
// against each ring directly; see containingPolygonsKey for the cached
// path the spread filter uses.
export const isInsideHallowedGround = (state: GameState, x: number, y: number): boolean => {
  const placed = state.placedMeteorites
  if (placed.length < 3) return false
  const edges = getStoneCircleGraph(placed)
  const polygons = getHallowedPolygons(placed, edges)
  if (polygons.length === 0) return false
  const px = x + 0.5
  const py = y + 0.5
  for (const polygon of polygons) {
    const ring = polygon.map(i => placed[i])
    if (pointInPolygon(px, py, ring)) return true
  }
  return false
}

// Stable string key composed of polygon indices containing (x + 0.5,
// y + 0.5), sorted ascending and comma-joined. Empty string for tiles
// outside all polygons. Used only by the render-pass tint layer; the
// spread filter now uses segmentCrossesAnyMeteoriteEdge instead.
export const containingPolygonsKey = (
  polygons: readonly (readonly number[])[],
  placed: readonly Position[],
  x: number,
  y: number
): string => {
  if (polygons.length === 0) return ''
  const px = x + 0.5
  const py = y + 0.5
  const hits: number[] = []
  for (let i = 0; i < polygons.length; i++) {
    const ring = polygons[i].map(idx => placed[idx])
    if (pointInPolygon(px, py, ring)) hits.push(i)
  }
  return hits.join(',')
}

// Standard 2D segment-segment intersection test. Returns true iff the
// open segments AB and CD cross each other strictly in their interiors;
// shared endpoints and collinear-overlap cases count as no-cross so
// candidates that simply touch a meteorite without passing through the
// wall are not falsely blocked.
const segmentsCross = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean => {
  const r1x = bx - ax
  const r1y = by - ay
  const r2x = dx - cx
  const r2y = dy - cy
  const denom = r1x * r2y - r1y * r2x
  if (denom === 0) return false
  const t = ((cx - ax) * r2y - (cy - ay) * r2x) / denom
  const u = ((cx - ax) * r1y - (cy - ay) * r1x) / denom
  return t > 0 && t < 1 && u > 0 && u < 1
}

// RP-18 wall semantics — egregoric spread cannot cross a connecting
// line between two placed meteorites. Returns true iff the segment from
// source tile center (sx + 0.5, sy + 0.5) to candidate tile center
// (cx + 0.5, cy + 0.5) crosses ANY meteorite-pair edge in the proximity
// graph. Two-meteorite walls and full polygons both block crossings;
// the test is local and does not need polygon detection.
export const segmentCrossesAnyMeteoriteEdge = (
  placed: readonly Position[],
  edges: readonly StoneCircleEdge[],
  sx: number,
  sy: number,
  cx: number,
  cy: number
): boolean => {
  if (edges.length === 0) return false
  const ax = sx + 0.5
  const ay = sy + 0.5
  const bx = cx + 0.5
  const by = cy + 0.5
  for (const e of edges) {
    const p1 = placed[e.aIndex]
    const p2 = placed[e.bIndex]
    if (segmentsCross(ax, ay, bx, by, p1.x, p1.y, p2.x, p2.y)) return true
  }
  return false
}
