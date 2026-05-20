import { HEX_GRID_SIZE, hashToHexGrid } from '@/engine/genetics'

interface GelBandViewProps {
  identity: string
}

// Gel-electrophoresis-style band view for a scanned flora specimen.
//
// Reuses the locked hashToHexGrid mapping from precis-3, but renders each
// nibble as a horizontal band whose alpha = nibble / 15 (0 → transparent,
// 15 → opaque). Rows are vertically blurred so adjacent bands bleed into
// each other, reading as a gel printout rather than a grid of digits.
//
// Cells are off-white (`bg-text`) against the modal's dark backdrop.
export const GelBandView = ({ identity }: GelBandViewProps) => {
  const grid = hashToHexGrid(identity)
  return (
    <div className="border-border my-2 inline-block border bg-black/40 p-2" data-testid="gel-band-view">
      <div
        className="grid gap-y-[2px]"
        style={{ gridTemplateColumns: `repeat(${String(HEX_GRID_SIZE)}, 18px)` }}
      >
        {grid.flatMap((row, rIdx) =>
          row.map((nibble, cIdx) => (
            <span
              key={`${String(rIdx)}-${String(cIdx)}`}
              data-testid={`gel-band-cell-${String(rIdx)}-${String(cIdx)}`}
              className="bg-text block h-[6px] w-[18px]"
              style={{
                opacity: nibble / 15,
                filter: 'blur(1.5px)',
              }}
            />
          )),
        )}
      </div>
    </div>
  )
}
