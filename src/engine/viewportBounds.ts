// Iteration ranges for renderer effect-overlay passes. In cartesian mode the
// visible footprint is the upright rectangle [0, viewportWidth) × [0,
// viewportHeight). In iso mode the same canvas covers a rotated parallelogram
// in tile space, so passes must expand to [-viewportHeight, viewportWidth +
// viewportHeight) on both axes — matching the main tile loop expansion in
// renderer.ts (~line 1330). A `margin` extends the bounds outward in tiles on
// every side; effect passes that should bleed past the visible edge (e.g.
// prairie halo, angel rain aura) pass it.

export interface VisibleTileBounds {
  vxStart: number
  vxEnd: number
  vyStart: number
  vyEnd: number
}

export const getVisibleTileBounds = (
  iso: boolean,
  viewportWidth: number,
  viewportHeight: number,
  margin = 0,
): VisibleTileBounds => {
  if (!iso) {
    return {
      vxStart: 0 - margin,
      vxEnd: viewportWidth + margin,
      vyStart: 0 - margin,
      vyEnd: viewportHeight + margin,
    }
  }
  return {
    vxStart: -viewportHeight - margin,
    vxEnd: viewportWidth + viewportHeight + margin,
    vyStart: -viewportHeight - margin,
    vyEnd: viewportHeight + viewportWidth + margin,
  }
}

export const isTileInVisibleViewport = (
  vx: number,
  vy: number,
  iso: boolean,
  viewportWidth: number,
  viewportHeight: number,
  margin = 0,
): boolean => {
  const { vxStart, vxEnd, vyStart, vyEnd } = getVisibleTileBounds(
    iso,
    viewportWidth,
    viewportHeight,
    margin,
  )
  return vx >= vxStart && vx < vxEnd && vy >= vyStart && vy < vyEnd
}
