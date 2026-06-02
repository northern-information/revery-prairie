// RP-70 — pure helpers for the map tab's hover hit-testing, split from
// MapPanel.tsx so the component file only exports a component (react-refresh)
// and the lookup stays unit-testable.

// A hoverable map icon: its screen position (captured during the draw pass)
// and the name revealed on hover. glyph/color drive the draw.
export interface MapIcon {
  px: number
  py: number
  glyph: string
  color: string
  name: string
}

// Hover hit radius around an icon's center, in CSS px.
export const HOVER_RADIUS = 16

// Pure hover lookup: the icon whose center is nearest the cursor within
// `radius`, or null. Center-clustered icons (house/cave/Whine at Gron)
// resolve to the single nearest — hover reveals one name at a time.
export const findHoveredIcon = (
  icons: MapIcon[],
  mx: number,
  my: number,
  radius = HOVER_RADIUS
): MapIcon | null => {
  let best: MapIcon | null = null
  let bestDist = radius * radius
  for (const icon of icons) {
    const dx = icon.px - mx
    const dy = icon.py - my
    const d2 = dx * dx + dy * dy
    if (d2 <= bestDist) {
      bestDist = d2
      best = icon
    }
  }
  return best
}
