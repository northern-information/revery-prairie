import { HEX_GRID_SIZE, hashToHexGrid } from '@/engine/genetics'

interface HexGridViewProps {
  identity: string
}

// Precis #6 — render the 8×8 hex nibble grid for a scanned flora specimen.
// Each cell is one hex nibble (0–15) shown as its hex character (0–9, a–f).
// The mapping comes from hashToHexGrid which is locked across game versions.
//
// Visual idiom: monospace, faint border per cell, small font. Sits in the
// manual entry header above the lore body.
export const HexGridView = ({ identity }: HexGridViewProps) => {
  const grid = hashToHexGrid(identity)
  return (
    <div className="border-border my-2 inline-block border p-1" data-testid="hex-grid-view">
      <div
        className="grid font-mono text-[10px] leading-none"
        style={{ gridTemplateColumns: `repeat(${String(HEX_GRID_SIZE)}, 14px)` }}
      >
        {grid.flatMap((row, rIdx) =>
          row.map((nibble, cIdx) => (
            <span
              key={`${String(rIdx)}-${String(cIdx)}`}
              className="text-dim border-border/40 flex h-[14px] items-center justify-center border"
            >
              {nibble.toString(16)}
            </span>
          )),
        )}
      </div>
    </div>
  )
}
