import { useEffect, useRef, useState } from 'react'

import { activateActionBarSlot, getSlotCooldownFraction } from '@/engine/actionBar'
import { getDefinition } from '@/engine/items'
import { getReveryDefinition } from '@/engine/reveries'
import type { ActionBarSlot, GameState } from '@/engine/types'
import type { DragState } from '@/hooks/useInventoryDrag'

const SLOT_SIZE = 36
const COOLDOWN_PINK = '#ff69b4'
const READY_PULSE_MS = 600
const CAST_FLASH_MS = 500

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
          ${COOLDOWN_PINK} ${String(degrees)}deg,
          ${COOLDOWN_PINK} 360deg
        )`,
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

const CastFlash = ({ active, flashKey }: { active: boolean; flashKey: number | null }) => {
  if (!active || flashKey === null) return null
  return (
    <div
      key={flashKey}
      data-cast-flash
      className="pointer-events-none absolute inset-0 rounded"
      style={{
        animation: `cast-flash ${String(CAST_FLASH_MS)}ms linear forwards`,
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
  const prevFractionRef = useRef<number | null>(null)
  const prevFraction = prevFractionRef.current ?? cooldownFraction
  const [readyPulseKey, setReadyPulseKey] = useState<number | null>(null)
  const [castFlashKey, setCastFlashKey] = useState<number | null>(null)

  // Detect cooldown completion: fraction was >0, now is 0
  if (prevFraction > 0 && cooldownFraction === 0) {
    setReadyPulseKey(now)
  }
  // Detect cast: revery slot cooldown transitioned from 0 to >0
  if (slot?.kind === 'revery' && prevFraction === 0 && cooldownFraction > 0) {
    setCastFlashKey(now)
  }
  prevFractionRef.current = cooldownFraction

  const isPulsing = readyPulseKey !== null && now - readyPulseKey < READY_PULSE_MS
  const isFlashing = castFlashKey !== null && now - castFlashKey < CAST_FLASH_MS

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
      {slot && <span className="text-bg relative z-10 text-xl leading-none">{glyph}</span>}
      <CooldownOverlay fraction={cooldownFraction} />
      <ReadyPulse active={isPulsing} />
      <CastFlash active={isFlashing} flashKey={castFlashKey} />
      <span className={`absolute right-1 bottom-0.5 z-10 text-[10px] ${slot ? 'text-bg' : 'text-dim'}`}>
        {String(index + 1)}
      </span>
    </button>
  )
}

export const ActionBar = ({ state, refreshUI, dragState, onSetActionBarTarget }: ActionBarProps) => {
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

  const clearCursorInfo = () => {
    state.cursorScreenPos = null
    state.cursorTile = null
  }

  return (
    <div
      data-panel="action-bar"
      className="pointer-events-auto fixed bottom-2 left-1/2 z-20 ml-[100px] flex -translate-x-1/2 items-center gap-1"
      onMouseEnter={clearCursorInfo}
      onMouseMove={clearCursorInfo}
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
