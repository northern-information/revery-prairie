import { LIGHTNING_BRANCH_CHANCE } from './constants'

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
