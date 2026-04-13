import { useState } from 'react'
import { SectionHeader } from './PanelPrimitives'

import { ANGEL_CANTOS_MAX } from '@/engine/constants'

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
        style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '0.9rem' }}
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
      <SectionHeader>
        angel cantos ({String(cantos.length)}/{String(ANGEL_CANTOS_MAX)})
      </SectionHeader>

      {cantos.length === 0 ? (
        <p className="text-dim text-xs">no cantos received. walk beneath an angel to hear one speak.</p>
      ) : (
        <>
          {/* 8x8 grid — one cell per canto */}
          <div
            className="mb-4 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${String(GRID_SIZE)}, 1fr)` }}
            data-testid="cantos-grid"
          >
            {Array.from({ length: ANGEL_CANTOS_MAX }, (_, i) => {
              const hash = cantos[i]
              const firstChar = hash ? hash[0] : null
              const isFilled = hash !== undefined
              const isHovered = hoveredIndex === i

              return (
                <button
                  key={i}
                  type="button"
                  className={`border-border-dim flex h-8 items-center justify-center border transition-colors ${
                    isHovered && isFilled
                      ? 'border-pink bg-pink/20 text-text'
                      : isFilled
                        ? 'text-permacomputer border-permacomputer/30 hover:border-pink'
                        : 'text-dim/20 border-border-dim/30'
                  }`}
                  style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '0.9rem' }}
                  onMouseEnter={() => {
                    if (isFilled) setHoveredIndex(i)
                  }}
                  onMouseLeave={() => {
                    setHoveredIndex(null)
                  }}
                  onFocus={() => {
                    if (isFilled) setHoveredIndex(i)
                  }}
                  onBlur={() => {
                    setHoveredIndex(null)
                  }}
                  tabIndex={isFilled ? 0 : -1}
                  aria-label={isFilled ? `canto ${String(i + 1)}: ${hash}` : `empty slot ${String(i + 1)}`}
                  data-testid={`canto-cell-${String(i)}`}
                >
                  {firstChar ?? '\u00b7'}
                </button>
              )
            })}
          </div>

          {/* Full hash display as 8x8 grid */}
          <div className="min-h-[12rem]">
            {hoveredHash ? (
              <div data-testid="canto-full-hash">
                <p className="text-dim mb-2 text-xs">full hash:</p>
                <HashGrid hash={hoveredHash} />
              </div>
            ) : (
              <p className="text-dim text-xs">hover a cell to reveal its hash</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
