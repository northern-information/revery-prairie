// Iteration ranges for renderer effect-overlay passes. The visible canvas
// covers a rotated parallelogram in tile space, so passes must expand to
// [-viewportHeight, viewportWidth + viewportHeight) on both axes — matching
// the main tile loop expansion in renderer.ts. A `margin` extends the
// bounds outward in tiles on every side; effect passes that should bleed
// past the visible edge (e.g. prairie halo, angel rain aura) pass it.

export interface VisibleTileBounds {
  vxStart: number
  vxEnd: number
  vyStart: number
  vyEnd: number
}

export const getVisibleTileBounds = (
  viewportWidth: number,
  viewportHeight: number,
  margin = 0,
): VisibleTileBounds => ({
  vxStart: -viewportHeight - margin,
  vxEnd: viewportWidth + viewportHeight + margin,
  vyStart: -viewportHeight - margin,
  vyEnd: viewportHeight + viewportWidth + margin,
})

export const isTileInVisibleViewport = (
  vx: number,
  vy: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 0,
): boolean => {
  const { vxStart, vxEnd, vyStart, vyEnd } = getVisibleTileBounds(
    viewportWidth,
    viewportHeight,
    margin,
  )
  return vx >= vxStart && vx < vxEnd && vy >= vyStart && vy < vyEnd
}
