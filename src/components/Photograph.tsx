import { TILE_COLORS } from '@/engine/constants'
import { sha256Sync } from '@/engine/crypto'
import { EGREGORE_GLYPHS } from '@/engine/egregore'
import { getCellDiamondCorners, viewportToScreen } from '@/engine/projection'
import { TileType } from '@/engine/types'
import type { TimeLapseCell } from '@/engine/types'

// RP-24 — predecessor footage degradation. `grain` ∈ [0, 1] biases the
// film-grain overlay opacity; `tint` is a CSS color overlay applied at
// low alpha; `glyphLeak` ∈ [0, 1] is the per-cell probability that the
// rendered cell's char is replaced by a hash-picked glyph from
// EGREGORE_GLYPHS (recolored to TILE_COLORS[TileType.Egregore] and
// rendered in the Voynich typeface).
export interface PhotographDegradation {
  grain: number
  tint: string
  glyphLeak: number
}

interface PhotographProps {
  cells: TimeLapseCell[]
  cellWidth: number
  cellHeight: number
  // Current-tenure frames omit this and render with no degradation
  // effects. Per-predecessor degradation is derived in
  // src/engine/predecessors/footage.ts.
  degradation?: PhotographDegradation
  // Per-predecessor + per-frame salt used to derive the deterministic
  // per-cell glyphLeak roll. Both `seedSalt` and `frameIndex` must be
  // present (alongside `degradation.glyphLeak > 0`) for the
  // substitution to run; missing either is a defensive fallback that
  // renders grain + tint only.
  seedSalt?: string | number
  frameIndex?: number
  testIdPrefix?: string
}

const LEAK_COLOR = TILE_COLORS[TileType.Egregore]

// Voynich glyphs live in the Private Use Area U+F121..U+F2FF. Any cell
// whose char falls in this range needs the 'Voynich' typeface — plain
// monospace has no glyphs in PUA and renders tofu. This applies both to
// leak-substituted cells and to originally-captured egregore tiles.
const VOYNICH_PUA_START = 0xf121
const VOYNICH_PUA_END = 0xf2ff
const isVoynichGlyph = (char: string): boolean => {
  const code = char.codePointAt(0)
  return code !== undefined && code >= VOYNICH_PUA_START && code <= VOYNICH_PUA_END
}

const hashTo32 = (message: string): number => parseInt(sha256Sync(message).slice(0, 8), 16) >>> 0
const rollUnit = (message: string): number => hashTo32(message) / 0x100000000

// Returns the leaked-glyph payload for the cell, or null when no
// substitution applies. `degradation` and the salt pair are required
// preconditions per the spec's defensive fallback.
const resolveLeak = (
  cellIdx: number,
  degradation: PhotographDegradation | undefined,
  seedSalt: string | number | undefined,
  frameIndex: number | undefined
): TimeLapseCell | null => {
  if (!degradation || degradation.glyphLeak <= 0) return null
  if (seedSalt === undefined || frameIndex === undefined) return null
  const root = `predecessors:${String(seedSalt)}:frame:${String(frameIndex)}:cell:${String(cellIdx)}`
  const r = rollUnit(`${root}:leak`)
  if (r >= degradation.glyphLeak) return null
  const h = hashTo32(`${root}:glyph`)
  const char = EGREGORE_GLYPHS[h % EGREGORE_GLYPHS.length]
  return { char, color: LEAK_COLOR }
}

const VIEWPORT_W = 3
const VIEWPORT_H = 3

// Render a 9-cell TimeLapseFrame payload as a small iso-projected
// photograph, reusing `viewportToScreen` and `getCellDiamondCorners`
// from src/engine/projection.ts so the contact-sheet frames share the
// same projection math as the world renderer. No cursor overlay, no
// fog, no seasonal wash — the photograph captures what the camera
// saw of the prairie itself.
export const Photograph = ({
  cells,
  cellWidth,
  cellHeight,
  degradation,
  seedSalt,
  frameIndex,
  testIdPrefix,
}: PhotographProps) => {
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
          const baseCell = cells[idx]
          if (!baseCell) return null
          const leak = resolveLeak(idx, degradation, seedSalt, frameIndex)
          const cell = leak ?? baseCell
          const { leftX, rightX, topY, bottomY, cx, cy } = getCellDiamondCorners(px, py, cellWidth, cellHeight)
          const diamond = `${String(cx)},${String(topY)} ${String(rightX)},${String(cy)} ${String(cx)},${String(bottomY)} ${String(leftX)},${String(cy)}`
          return (
            <g
              key={idx}
              data-testid={`${testIdPrefix ?? 'photograph'}-cell-${String(idx)}`}
              data-leak={leak ? 'true' : undefined}
            >
              <polygon points={diamond} fill="#000" />
              <text
                x={cx}
                y={cy}
                fill={cell.color}
                fontFamily={leak || isVoynichGlyph(cell.char) ? "'Voynich', monospace" : 'monospace'}
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
