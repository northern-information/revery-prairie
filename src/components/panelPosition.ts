const PANEL_GAP = 16
const EDGE_MARGIN = 8

export interface PanelPosition {
  left: number
  top: number
}

/**
 * Compute a clamped panel position relative to the player.
 * Prefers above-right; flips axes independently when the panel would clip.
 */
export const clampPanelPosition = (
  playerScreenX: number,
  playerScreenY: number,
  charWidth: number,
  charHeight: number,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number
): PanelPosition => {
  // Candidate positions for each axis
  const rightX = playerScreenX + charWidth + PANEL_GAP
  const leftX = playerScreenX - panelWidth - PANEL_GAP
  const aboveY = playerScreenY - panelHeight - PANEL_GAP
  const belowY = playerScreenY + charHeight + PANEL_GAP

  // Pick horizontal: prefer right, flip to left if it clips
  let left = rightX + panelWidth + EDGE_MARGIN <= viewportWidth ? rightX : leftX

  // Pick vertical: prefer above, flip to below if it clips
  let top = aboveY >= EDGE_MARGIN ? aboveY : belowY

  // Final clamp to keep fully on-screen
  left = Math.max(EDGE_MARGIN, Math.min(left, viewportWidth - panelWidth - EDGE_MARGIN))
  top = Math.max(EDGE_MARGIN, Math.min(top, viewportHeight - panelHeight - EDGE_MARGIN))

  return { left, top }
}
