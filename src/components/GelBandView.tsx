import { hashToHexGrid, HEX_GRID_SIZE } from '@/engine/genetics'

export type GelBandVariant = 'flora' | 'egregore'

interface GelBandViewProps {
  identity: string
  variant?: GelBandVariant
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

// Per-variant palette. Both variants share the gold/bee reticle border
// and side-label text tokens so the viewfinder chrome reads consistent
// across all scan kinds. Only the gel band color itself varies — gold
// (bg-bee) for flora/oak, violet (#B080D0, the egregore glyph color)
// for egregore.
const VARIANTS = {
  flora: {
    border: 'border-bee',
    text: 'text-bee',
    band: 'bg-bee',
    // Jitter amplitudes for the flora variant.
    widthMin: 0.8,
    widthRange: 0.2,
    offsetXRange: 6,
    offsetYRange: 3,
  },
  egregore: {
    // Reticle + side labels stay on the gold/bee tokens; only the gel
    // bands swap to violet. The bg color is the egregore glyph color
    // (#B080D0) and is set via a bracketed Tailwind class — v4 picks
    // it up because the class is enumerated literally.
    border: 'border-bee',
    text: 'text-bee',
    band: 'bg-[#B080D0]',
    // Amplified jitter: ~1.7x the flora variant for a noisier printout.
    widthMin: 0.65,
    widthRange: 0.35,
    offsetXRange: 10,
    offsetYRange: 5,
  },
} as const

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

// Per-column width profile for the egregore variant. Returns an array of
// 8 widths summing to TOTAL_SIZE (CELL_WIDTH * HEX_GRID_SIZE = 320). Each
// column's width is derived from a different identity-hash channel so
// the profile is deterministic per specimen and varies across specimens.
//
// Range per column: ~24..56 px. Computed by sampling 8 raw values from
// the identity, normalizing, and scaling to the target sum.
const computeColumnWidths = (identity: string): number[] => {
  const raw: number[] = []
  for (let c = 0; c < HEX_GRID_SIZE; c++) {
    // Bias to 0.6..1.4 so columns vary by roughly ±40% before normalizing.
    raw.push(0.6 + cellNoise(identity, 0, c, 11) * 0.8)
  }
  const sum = raw.reduce((a, b) => a + b, 0)
  return raw.map(w => (w / sum) * TOTAL_SIZE)
}

// Reticle corner marks — two thin lines meeting at a corner, evoking a
// viewfinder or crop guide. Color follows the variant palette.
// `aria-hidden` because the marks carry no semantic content for
// screen readers.
const buildCropClasses = (borderClass: string) => {
  const cropBase = `${borderClass} absolute h-4 w-4`
  return {
    tl: `${cropBase} -top-4 -left-4 border-t-2 border-l-2`,
    tr: `${cropBase} -top-4 -right-4 border-t-2 border-r-2`,
    bl: `${cropBase} -bottom-4 -left-4 border-b-2 border-l-2`,
    br: `${cropBase} -bottom-4 -right-4 border-b-2 border-r-2`,
  } as const
}

// Gel-electrophoresis-style band view for a scanned specimen (flora or
// egregore tile). Reuses the locked hashToHexGrid mapping from RP-3
// for the 8x8 opacity grid; only palette and column geometry vary by
// variant.
//
// Per the spec (RP-8a → egregore-glyph-scan-fix):
//   - flora variant: gold/bee palette, uniform column widths, base jitter
//   - egregore variant: violet palette, per-column hash-derived widths,
//     amplified band jitter
//
// Bounding box width stays at TOTAL_SIZE so the modal layout is stable
// across variants.
export const GelBandView = ({ identity, variant = 'flora', revealedCells = TOTAL_CELLS }: GelBandViewProps) => {
  const palette = VARIANTS[variant]
  const grid = hashToHexGrid(identity)
  const edgeCode = identity.slice(0, 8)
  const sideLabel = `NORTHERN-INFORMATION · ${edgeCode}`
  const cropClasses = buildCropClasses(palette.border)
  const columnWidths = variant === 'egregore' ? computeColumnWidths(identity) : null
  return (
    <div className="inline-flex items-center gap-3" data-testid="gel-band-view" data-variant={variant}>
      <div
        data-testid="gel-side-label-left"
        style={{ height: TOTAL_SIZE }}
        className={`${palette.text} flex [transform:rotate(180deg)] items-center justify-center font-mono text-[9px] leading-none tracking-[0.3em] [writing-mode:vertical-rl]`}
      >
        {sideLabel}
      </div>
      <div className="relative" style={{ width: TOTAL_SIZE, height: TOTAL_SIZE }}>
        <span aria-hidden="true" data-testid="gel-crop-tl" className={cropClasses.tl} />
        <span aria-hidden="true" data-testid="gel-crop-tr" className={cropClasses.tr} />
        <span aria-hidden="true" data-testid="gel-crop-bl" className={cropClasses.bl} />
        <span aria-hidden="true" data-testid="gel-crop-br" className={cropClasses.br} />
        <div
          className="grid"
          style={{
            gridTemplateColumns: columnWidths
              ? columnWidths.map(w => `${String(w)}px`).join(' ')
              : `repeat(${String(HEX_GRID_SIZE)}, ${String(CELL_WIDTH)}px)`,
            rowGap: `${String(ROW_GAP)}px`,
          }}
        >
          {grid.flatMap((row, rIdx) =>
            row.map((nibble, cIdx) => {
              // The band width is a fraction of the column's allocated
              // width — uniform CELL_WIDTH for flora, per-column for
              // egregore. Jitter scales band fraction inside its slot.
              const slotWidth = columnWidths ? columnWidths[cIdx] : CELL_WIDTH
              const widthScale = palette.widthMin + cellNoise(identity, rIdx, cIdx, 0) * palette.widthRange
              const bandWidth = slotWidth * widthScale
              const offsetX = (cellNoise(identity, rIdx, cIdx, 1) - 0.5) * palette.offsetXRange
              const offsetY = (cellNoise(identity, rIdx, cIdx, 2) - 0.5) * palette.offsetYRange
              // Column-major reveal index: column 0 fills top-to-bottom first,
              // then column 1, etc. Cell is hidden until its index < revealedCells.
              const revealIndex = cIdx * HEX_GRID_SIZE + rIdx
              const isRevealed = revealIndex < revealedCells
              return (
                <span
                  key={`${String(rIdx)}-${String(cIdx)}`}
                  data-testid={`gel-band-cell-${String(rIdx)}-${String(cIdx)}`}
                  data-revealed={isRevealed}
                  className={`${palette.band} block`}
                  style={{
                    width: bandWidth,
                    height: CELL_HEIGHT,
                    marginLeft: (slotWidth - bandWidth) / 2 + offsetX,
                    transform: `translateY(${String(offsetY)}px)`,
                    opacity: isRevealed ? nibble / 15 : 0,
                    filter: 'blur(2.5px)',
                  }}
                />
              )
            })
          )}
        </div>
      </div>
      <div
        data-testid="gel-edge-code"
        style={{ height: TOTAL_SIZE }}
        className={`${palette.text} flex items-center justify-center font-mono text-[9px] leading-none tracking-widest [writing-mode:vertical-rl]`}
      >
        ▶ {edgeCode} ◀ · N-INFO 400
      </div>
    </div>
  )
}
