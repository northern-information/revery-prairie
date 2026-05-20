import { HEX_GRID_SIZE, hashToHexGrid } from '@/engine/genetics'

interface GelBandViewProps {
  identity: string
  // Number of cells revealed in column-major order — (col=0,row=0) is
  // revealed first, then (col=0,row=1), …, (col=0,row=7), (col=1,row=0), …
  // Omit or pass HEX_GRID_SIZE * HEX_GRID_SIZE to render the whole gel.
  revealedCells?: number
}

const CELL_WIDTH = 40
const CELL_HEIGHT = 22
const ROW_GAP = CELL_WIDTH - CELL_HEIGHT
const TOTAL_SIZE = CELL_WIDTH * HEX_GRID_SIZE
const TOTAL_CELLS = HEX_GRID_SIZE * HEX_GRID_SIZE

// Cheap deterministic [0, 1) hash of (identity, r, c). Uses identity hex
// characters at row/col-derived offsets so the same specimen always
// produces the same visual jitter, while different specimens get
// different patterns. Stays inside the locked-mapping doctrine: opacity
// still comes from hashToHexGrid; this only feeds visual-only jitter
// (band width, horizontal offset).
const cellNoise = (identity: string, r: number, c: number, salt: number): number => {
  const i1 = (r * HEX_GRID_SIZE + c + salt * 7) % identity.length
  const i2 = (r * 11 + c * 17 + salt * 23 + 5) % identity.length
  const a = parseInt(identity[i1], 16)
  const b = parseInt(identity[i2], 16)
  return ((a * 16 + b) % 256) / 256
}

// Gel-electrophoresis-style band view for a scanned flora specimen.
//
// Reuses the locked hashToHexGrid mapping from precis-3, but renders each
// nibble as a horizontal band whose alpha = nibble / 15 (0 → transparent,
// 15 → opaque). Rows are vertically blurred so adjacent bands bleed into
// each other, reading as a gel printout rather than a grid of digits.
//
// Visual-only jitter (horizontal scale + offset) per cell, deterministic
// per identity, breaks the perfectly-rectangular grid feel so bands read
// as a real wet-lab gel.
// Sprocket strip — decorative perforations along the long edges of a 35mm
// rebate. `aria-hidden` because the dots carry no semantic content for
// screen readers.
const Sprockets = ({ testId }: { testId: string }) => (
  <div
    aria-hidden="true"
    data-testid={testId}
    className="text-dim flex justify-between px-1 font-mono text-[10px] leading-none tracking-widest"
  >
    {Array.from({ length: 12 }).map((_, i) => (
      <span key={i}>▪</span>
    ))}
  </div>
)

export const GelBandView = ({ identity, revealedCells = TOTAL_CELLS }: GelBandViewProps) => {
  const grid = hashToHexGrid(identity)
  const edgeCode = identity.slice(0, 8)
  return (
    <div
      className="inline-flex items-stretch gap-1"
      data-testid="gel-band-view"
    >
      <div
        aria-hidden="true"
        data-testid="gel-side-label"
        className="text-dim font-mono text-[9px] leading-none tracking-[0.3em] [writing-mode:vertical-rl] [transform:rotate(180deg)]"
      >
        NORTHERN-INFORMATION · {edgeCode}
      </div>
      <div className="flex flex-col">
        <Sprockets testId="gel-sprocket-top" />
        <div className="flex items-center gap-1">
          <span
            aria-hidden="true"
            data-testid="gel-bracket-left"
            className="text-dim font-mono text-2xl leading-none"
          >
            [
          </span>
          <div style={{ width: TOTAL_SIZE, height: TOTAL_SIZE }}>
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${String(HEX_GRID_SIZE)}, ${String(CELL_WIDTH)}px)`,
                rowGap: `${String(ROW_GAP)}px`,
              }}
            >
              {grid.flatMap((row, rIdx) =>
                row.map((nibble, cIdx) => {
                  // Width jitter: 80–100% of CELL_WIDTH.
                  const widthScale = 0.8 + cellNoise(identity, rIdx, cIdx, 0) * 0.2
                  // Horizontal offset: ±3px.
                  const offsetX = (cellNoise(identity, rIdx, cIdx, 1) - 0.5) * 6
                  // Vertical offset: ±1.5px so band centers don't perfectly align row-to-row.
                  const offsetY = (cellNoise(identity, rIdx, cIdx, 2) - 0.5) * 3
                  // Column-major reveal index: column 0 fills top-to-bottom first,
                  // then column 1, etc. Cell is hidden until its index < revealedCells.
                  const revealIndex = cIdx * HEX_GRID_SIZE + rIdx
                  const isRevealed = revealIndex < revealedCells
                  return (
                    <span
                      key={`${String(rIdx)}-${String(cIdx)}`}
                      data-testid={`gel-band-cell-${String(rIdx)}-${String(cIdx)}`}
                      data-revealed={isRevealed}
                      className="bg-bee block"
                      style={{
                        width: CELL_WIDTH * widthScale,
                        height: CELL_HEIGHT,
                        marginLeft: (CELL_WIDTH - CELL_WIDTH * widthScale) / 2 + offsetX,
                        transform: `translateY(${String(offsetY)}px)`,
                        opacity: isRevealed ? nibble / 15 : 0,
                        filter: 'blur(2.5px)',
                      }}
                    />
                  )
                }),
              )}
            </div>
          </div>
          <span
            aria-hidden="true"
            data-testid="gel-bracket-right"
            className="text-dim font-mono text-2xl leading-none"
          >
            ]
          </span>
        </div>
        <Sprockets testId="gel-sprocket-bottom" />
        <div
          data-testid="gel-edge-code"
          className="text-dim mt-0.5 px-1 font-mono text-[9px] leading-none tracking-widest"
        >
          → {edgeCode} → N-INFO 400
        </div>
      </div>
    </div>
  )
}
