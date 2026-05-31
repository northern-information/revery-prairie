import { getCellDiamondCorners, viewportToScreen } from '@/engine/projection'
import type { TimeLapseCell } from '@/engine/types'

// Reserved degradation interface for RP-24 (predecessor footage). The
// current spec authors nothing into this; the prop only fixes the
// shape so the next round's pipeline can plug in without a
// component-level rewrite. `grain` ∈ [0, 1] biases the film-grain
// overlay opacity; `tint` is a CSS color overlay applied at low
// alpha; `glyphLeak` reserves a 0..1 slot for occasional egregoric
// glyph substitution (content authored by RP-24, not here).
export interface PhotographDegradation {
  grain: number
  tint: string
  glyphLeak: number
}

interface PhotographProps {
  cells: TimeLapseCell[]
  cellWidth: number
  cellHeight: number
  // Reserved for RP-24 — current-tenure frames omit this and render
  // with no degradation effects. TODO(RP-24): wire glyphLeak content
  // through the egregore allowlist; this component must not author
  // its own EVA tokens.
  degradation?: PhotographDegradation
  testIdPrefix?: string
}

const VIEWPORT_W = 3
const VIEWPORT_H = 3

// Render a 9-cell TimeLapseFrame payload as a small iso-projected
// photograph, reusing `viewportToScreen` and `getCellDiamondCorners`
// from src/engine/projection.ts so the contact-sheet frames share the
// same projection math as the world renderer. No cursor overlay, no
// fog, no seasonal wash — the photograph captures what the camera
// saw of the prairie itself.
export const Photograph = ({ cells, cellWidth, cellHeight, degradation, testIdPrefix }: PhotographProps) => {
  // Compute SVG bounding box by walking the four corner cells of the
  // 3x3 viewport. The diamond geometry stretches beyond the per-cell
  // anchors, so we need every corner of every cell to figure out the
  // outer extent.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  const anchors: { px: number; py: number; idx: number }[] = []
  for (let vy = 0; vy < VIEWPORT_H; vy++) {
    for (let vx = 0; vx < VIEWPORT_W; vx++) {
      const { px, py } = viewportToScreen(vx, vy, cellWidth, cellHeight, VIEWPORT_W, VIEWPORT_H)
      const idx = vy * VIEWPORT_W + vx
      anchors.push({ px, py, idx })
      const { leftX, rightX, topY, bottomY } = getCellDiamondCorners(px, py, cellWidth, cellHeight)
      if (leftX < minX) minX = leftX
      if (rightX > maxX) maxX = rightX
      if (topY < minY) minY = topY
      if (bottomY > maxY) maxY = bottomY
    }
  }

  const svgWidth = maxX - minX
  const svgHeight = maxY - minY
  const viewBox = `${String(minX)} ${String(minY)} ${String(svgWidth)} ${String(svgHeight)}`

  // Resolve the cell list — anchors are ordered (vy, vx) row-major,
  // which matches FRAME_OFFSETS in timeLapse.ts (NW, N, NE, W, C, E,
  // SW, S, SE).
  return (
    <div
      data-testid={testIdPrefix ?? 'photograph'}
      className="film-grain-overlay relative overflow-hidden bg-black"
      style={{ width: svgWidth, height: svgHeight }}
    >
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {anchors.map(({ px, py, idx }) => {
          const cell = cells[idx]
          if (!cell) return null
          const { leftX, rightX, topY, bottomY, cx, cy } = getCellDiamondCorners(px, py, cellWidth, cellHeight)
          const diamond = `${String(cx)},${String(topY)} ${String(rightX)},${String(cy)} ${String(cx)},${String(bottomY)} ${String(leftX)},${String(cy)}`
          return (
            <g key={idx} data-testid={`${testIdPrefix ?? 'photograph'}-cell-${String(idx)}`}>
              <polygon points={diamond} fill="#000" />
              <text
                x={cx}
                y={cy}
                fill={cell.color}
                fontFamily="monospace"
                fontSize={cellHeight * 0.7}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {cell.char}
              </text>
            </g>
          )
        })}
      </svg>
      {degradation && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: degradation.tint, opacity: Math.min(0.4, degradation.grain * 0.4) }}
        />
      )}
    </div>
  )
}
