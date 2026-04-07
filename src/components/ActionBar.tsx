import { useEffect, useRef, useState } from 'react'

import { activateActionBarSlot, getSlotCooldownFraction } from '@/engine/actionBar'
import { getReveryDefinition } from '@/engine/reveries'
import { getDefinition } from '@/engine/items'
import type { ActionBarSlot, GameState } from '@/engine/types'
import type { DragState } from '@/hooks/useInventoryDrag'

const SLOT_SIZE = 48
const COOLDOWN_GOLD = '#DAA520'

interface ActionBarProps {
  state: GameState
  refreshUI: () => void
  dragState: DragState | null
  onSetActionBarTarget: (slotIndex: number | null) => void
  onOpenReveries: () => void
}

const getSlotGlyph = (slot: ActionBarSlot): string => {
  if (slot.kind === 'revery') {
    return getReveryDefinition(slot.id).glyphs[0]
  }
  return getDefinition(slot.id).glyph
}

const getSlotColor = (slot: ActionBarSlot): string => {
  if (slot.kind === 'revery') {
    return getReveryDefinition(slot.id).glyphColor
  }
  return getDefinition(slot.id).glyphColor
}

const CooldownOverlay = ({ fraction }: { fraction: number }) => {
  if (fraction <= 0) return null
  const degrees = (1 - fraction) * 360
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded"
      style={{
        background: `conic-gradient(
          from 0deg,
          transparent 0deg,
          transparent ${String(degrees)}deg,
          ${COOLDOWN_GOLD} ${String(degrees)}deg,
          ${COOLDOWN_GOLD} 360deg
        )`,
        opacity: 0.6,
      }}
    />
  )
}

const ActionBarSlotView = ({
  slot,
  index,
  isDragHighlighted,
  isHeld,
  now,
  onActivate,
  onMouseEnter,
  onMouseLeave,
}: {
  slot: ActionBarSlot | null
  index: number
  isDragHighlighted: boolean
  isHeld: boolean
  now: number
  onActivate: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}) => {
  const cooldownFraction = slot ? getSlotCooldownFraction(slot, now) : 0

  const glyph = slot ? getSlotGlyph(slot) : ''
  const slotBgColor = slot ? getSlotColor(slot) : ''

  return (
    <button
      className={`relative flex items-center justify-center rounded border font-mono ${
        isDragHighlighted
          ? 'border-[--color-pink]'
          : isHeld
            ? 'border-white'
            : slot
              ? 'border-[--color-border]'
              : 'border-[--color-border]/50'
      } transition-colors`}
      style={{
        width: SLOT_SIZE,
        height: SLOT_SIZE,
        backgroundColor: slot ? slotBgColor : 'rgba(0, 0, 0, 0.7)',
      }}
      onClick={onActivate}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {slot && (
        <span className="z-10 text-xl leading-none" style={{ color: '#1a1a1a' }}>
          {glyph}
        </span>
      )}
      <CooldownOverlay fraction={cooldownFraction} />
      <span className="absolute right-1 bottom-0.5 z-10 text-[10px]" style={{ color: slot ? '#1a1a1a' : 'var(--color-dim)' }}>
        {String(index + 1)}
      </span>
    </button>
  )
}

export const ActionBar = ({ state, refreshUI, dragState, onSetActionBarTarget, onOpenReveries }: ActionBarProps) => {
  const rafRef = useRef(0)
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    const animate = (time: number) => {
      setNow(time)
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const hasDrag = dragState !== null

  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1">
      {state.reveries.length > 0 && (
        <button
          className="mr-1 flex items-center justify-center rounded border border-[--color-border]/50 bg-black/70 font-mono text-xs text-[--color-dim] transition-colors hover:border-[--color-border] hover:text-[--color-text]"
          style={{ width: 24, height: SLOT_SIZE }}
          onClick={onOpenReveries}
          title="reveries [q]"
        >
          R
        </button>
      )}
      {state.actionBar.map((slot, i) => (
        <ActionBarSlotView
          key={i}
          slot={slot}
          index={i}
          isDragHighlighted={hasDrag && slot === null}
          isHeld={state.heldActionSlot === i}
          now={now}
          onActivate={() => {
            if (activateActionBarSlot(state, i, performance.now())) {
              refreshUI()
            }
          }}
          onMouseEnter={() => {
            if (hasDrag) {
              onSetActionBarTarget(i)
            }
          }}
          onMouseLeave={() => {
            if (hasDrag) {
              onSetActionBarTarget(null)
            }
          }}
        />
      ))}
    </div>
  )
}
