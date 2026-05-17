import { LIGHTNING_BRANCH_CHANCE } from './constants'

interface BoltPos {
  x: number
  y: number
}

// Map a canonical path (built with cy -= 1 + dx jitter, then reversed so
// path[0] is top and path[length-1] is impact) to tile coords that project
// to a vertical screen line under the active projection. Per-step
// canonical→world mapping (going from impact upward through the path):
//   canonical dx = 0  → world step (-1, -1)   straight up on screen
//   canonical dx = +1 → world step ( 0, -1)   half-step up-right
//   canonical dx = -1 → world step (-1,  0)   half-step up-left
// Branch (canonical: bx += branchDir, by += 1, anchored on the main path)
// is anchored to the iso-mapped fork point and walked with:
//   branchDir = +1 → world step (1, 0)
//   branchDir = -1 → world step (0, 1)
// The canonical path data is preserved; this function returns parallel
// projected arrays.
export const projectBoltPath = (
  path: BoltPos[],
  branch: BoltPos[] | null
): { path: BoltPos[]; branch: BoltPos[] | null } => {
  const n = path.length
  if (n === 0) return { path: [], branch: null }
  const isoPath: BoltPos[] = new Array<BoltPos>(n)
  const impact = path[n - 1]
  isoPath[n - 1] = { x: impact.x, y: impact.y }
  for (let i = n - 2; i >= 0; i--) {
    const canonicalDx = path[i].x - path[i + 1].x
    let stepDx: number
    let stepDy: number
    if (canonicalDx === 0) {
      stepDx = -1
      stepDy = -1
    } else if (canonicalDx > 0) {
      stepDx = 0
      stepDy = -1
    } else {
      stepDx = -1
      stepDy = 0
    }
    isoPath[i] = { x: isoPath[i + 1].x + stepDx, y: isoPath[i + 1].y + stepDy }
  }

  let isoBranch: BoltPos[] | null = null
  if (branch && branch.length > 0) {
    // Find the canonical anchor (first branch point's "previous" tile is on
    // the main path; canonical branch starts one step away from a path tile).
    // The canonical generator anchors at path[branchStart] then moves outward.
    // We reconstruct: the first branch tile sits one step (dx=branchDir, dy=+1)
    // from its anchor on the canonical path. Find that anchor by searching.
    const first = branch[0]
    let anchorIdx = -1
    for (let i = 0; i < n; i++) {
      if (Math.abs(path[i].x - first.x) === 1 && path[i].y + 1 === first.y) {
        anchorIdx = i
        break
      }
    }
    if (anchorIdx >= 0) {
      const branchDir = first.x - path[anchorIdx].x // +1 or -1
      const stepDx = branchDir > 0 ? 1 : 0
      const stepDy = branchDir > 0 ? 0 : 1
      const anchor = isoPath[anchorIdx]
      isoBranch = branch.map((_, i) => ({
        x: anchor.x + stepDx * (i + 1),
        y: anchor.y + stepDy * (i + 1),
      }))
    }
  }

  return { path: isoPath, branch: isoBranch }
}

export const generateBoltPath = (
  impactX: number,
  impactY: number,
  length: number,
  rng: () => number
): { path: { x: number; y: number }[]; branch: { x: number; y: number }[] | null } => {
  const path: { x: number; y: number }[] = []

  // Build from impact upward, then reverse so path[0] is the top
  let cx = impactX
  let cy = impactY
  path.push({ x: cx, y: cy })

  for (let i = 1; i < length; i++) {
    const roll = rng()
    const dx = roll < 0.25 ? -1 : roll < 0.5 ? 1 : 0
    cy -= 1
    cx += dx
    path.push({ x: cx, y: cy })
  }

  path.reverse()

  // Optional branch fork
  let branch: { x: number; y: number }[] | null = null
  if (rng() < LIGHTNING_BRANCH_CHANCE && path.length >= 4) {
    const branchStart = 1 + Math.floor(rng() * (path.length - 3))
    const branchLen = 2 + Math.floor(rng() * 2)
    const branchDir = rng() < 0.5 ? -1 : 1
    branch = []
    let bx = path[branchStart].x
    let by = path[branchStart].y
    for (let i = 0; i < branchLen; i++) {
      bx += branchDir
      by += 1
      branch.push({ x: bx, y: by })
    }
  }

  return { path, branch }
}
