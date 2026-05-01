import { useEffect, useRef, useState } from 'react'

import { activateActionBarSlot, getSlotCooldownFraction } from '@/engine/actionBar'
import { getDefinition } from '@/engine/items'
import { getReveryDefinition } from '@/engine/reveries'
import type { ActionBarSlot, GameState } from '@/engine/types'
import type { DragState } from '@/hooks/useInventoryDrag'

const SLOT_SIZE = 48
const COOLDOWN_GOLD = '#DAA520'
const READY_PULSE_MS = 600

interface ActionBarProps {
  state: GameState
  refreshUI: () => void
  dragState: DragState | null
  onSetActionBarTarget: (slotIndex: number | null) => void
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

const ReadyPulse = ({ active }: { active: boolean }) => {
  if (!active) return null
  return (
    <div
      className="pointer-events-none absolute inset-0 rounded"
      style={{
        boxShadow: '0 0 8px 2px rgba(255, 255, 255, 0.8), inset 0 0 4px rgba(255, 255, 255, 0.4)',
        animation: `ready-pulse ${String(READY_PULSE_MS)}ms ease-out forwards`,
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
  const prevFractionRef = useRef(0)
  const [readyPulseKey, setReadyPulseKey] = useState<number | null>(null)

  // Detect cooldown completion: fraction was >0, now is 0
  if (prevFractionRef.current > 0 && cooldownFraction === 0) {
    setReadyPulseKey(now)
  }
  prevFractionRef.current = cooldownFraction

  // Clear pulse after animation duration
  const isPulsing = readyPulseKey !== null && now - readyPulseKey < READY_PULSE_MS

  const glyph = slot ? getSlotGlyph(slot) : ''
  const slotBgColor = slot ? getSlotColor(slot) : ''

  return (
    <button
      className={`relative flex items-center justify-center rounded border font-mono ${
        isDragHighlighted ? 'border-pink' : isHeld ? 'border-white' : slot ? 'border-border' : 'border-border/50'
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
      {slot && <span className="text-bg z-10 text-xl leading-none">{glyph}</span>}
      <CooldownOverlay fraction={cooldownFraction} />
      <ReadyPulse active={isPulsing} />
      <span className={`absolute right-1 bottom-0.5 z-10 text-[10px] ${slot ? 'text-bg' : 'text-dim'}`}>
        {String(index + 1)}
      </span>
    </button>
  )
}

export const ActionBar = ({
  state,
  refreshUI,
  dragState,
  onSetActionBarTarget,
}: ActionBarProps) => {
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

  const suppressEdgeScroll = () => {
    state.edgeScrollPos = null
    state.cursorScreenPos = null
    state.cursorTile = null
  }

  return (
    <div
      className="pointer-events-auto fixed top-2 left-2 z-10 flex items-center gap-1"
      onMouseEnter={suppressEdgeScroll}
      onMouseMove={suppressEdgeScroll}
    >
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
