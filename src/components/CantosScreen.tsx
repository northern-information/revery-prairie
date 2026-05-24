import { useState } from 'react'
import { SectionHeader } from './PanelPrimitives'

interface CantosScreenProps {
  cantos: string[]
}

const GRID_SIZE = 8

const HashGrid = ({ hash }: { hash: string }) => (
  <div
    className="mx-auto grid gap-0.5"
    style={{ gridTemplateColumns: `repeat(${String(GRID_SIZE)}, 1fr)`, width: 'fit-content' }}
    data-testid="canto-hash-grid"
  >
    {Array.from({ length: 64 }, (_, i) => (
      <div
        key={i}
        className="text-permacomputer flex h-6 w-6 items-center justify-center"
        style={{
          fontFamily:
            '"Libre Baskerville", Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, "Times New Roman", serif',
          fontSize: '0.9rem',
        }}
      >
        {hash[i] ?? '\u00b7'}
      </div>
    ))}
  </div>
)

export const CantosScreen = ({ cantos }: CantosScreenProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const hoveredHash = hoveredIndex !== null ? (cantos[hoveredIndex] ?? null) : null

  return (
    <div>
      <SectionHeader>Angel Cantos ({String(cantos.length)})</SectionHeader>

      {cantos.length === 0 ? (
        <p className="text-dim text-xs">No cantos received. Walk beneath an angel to hear one speak.</p>
      ) : (
        <>
          {/* Grid of cantos — one cell per canto, wraps in rows of 8 */}
          <div
            className="mb-4 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${String(GRID_SIZE)}, 1fr)` }}
            data-testid="cantos-grid"
          >
            {cantos.map((hash, i) => {
              const firstChar = hash[0]
              const isHovered = hoveredIndex === i

              return (
                <button
                  key={i}
                  type="button"
                  className={`border-border-dim flex h-8 items-center justify-center border transition-colors ${
                    isHovered
                      ? 'border-pink bg-pink/20 text-text'
                      : 'text-permacomputer border-permacomputer/30 hover:border-pink'
                  }`}
                  style={{
                    fontFamily:
                      '"Libre Baskerville", Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, "Times New Roman", serif',
                    fontSize: '0.9rem',
                  }}
                  onMouseEnter={() => {
                    setHoveredIndex(i)
                  }}
                  onMouseLeave={() => {
                    setHoveredIndex(null)
                  }}
                  onFocus={() => {
                    setHoveredIndex(i)
                  }}
                  onBlur={() => {
                    setHoveredIndex(null)
                  }}
                  tabIndex={0}
                  aria-label={`canto ${String(i + 1)}: ${hash}`}
                  data-testid={`canto-cell-${String(i)}`}
                >
                  {firstChar}
                </button>
              )
            })}
          </div>

          {/* Full hash display as 8x8 grid */}
          <div className="min-h-[12rem]">
            {hoveredHash ? (
              <div data-testid="canto-full-hash">
                <p className="text-dim mb-2 text-xs">Full hash:</p>
                <HashGrid hash={hoveredHash} />
              </div>
            ) : (
              <p className="text-dim text-xs">Hover a cell to reveal its hash.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
