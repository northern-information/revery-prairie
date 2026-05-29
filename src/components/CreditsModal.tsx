import { useEffect, useRef } from 'react'

import { ModalShell } from './ModalShell'

import type { Credit } from '@/engine/credits'
import { playClick, playHover } from '@/engine/sfx'

interface CreditsModalProps {
  credits: readonly Credit[]
  onClose: () => void
}

const SCROLL_PX_PER_SEC = 30
const MIN_DURATION_MS = 6_000
const MAX_DURATION_MS = 60_000

export const CreditsModal = ({ credits, onClose }: CreditsModalProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const userInterruptedRef = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (credits.length === 0) return

    const distance = el.scrollHeight - el.clientHeight
    if (distance <= 0) return

    const rawDuration = (distance / SCROLL_PX_PER_SEC) * 1_000
    const duration = Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, rawDuration))

    let raf = 0
    const start = performance.now()

    const step = (now: number) => {
      if (userInterruptedRef.current) return
      const t = Math.min(1, (now - start) / duration)
      el.scrollTop = distance * t
      if (t < 1) {
        raf = requestAnimationFrame(step)
      }
    }
    raf = requestAnimationFrame(step)

    const cancel = () => {
      userInterruptedRef.current = true
    }
    el.addEventListener('wheel', cancel, { passive: true })
    el.addEventListener('touchstart', cancel, { passive: true })

    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('wheel', cancel)
      el.removeEventListener('touchstart', cancel)
    }
  }, [credits.length])

  return (
    <ModalShell
      onDismiss={onClose}
      ariaLabelledBy="credits-modal-title"
      data-testid="credits-modal-backdrop"
      contentTestId="credits-modal"
      contentClassName="border-border-dim flex max-h-[60vh] w-96 flex-col border bg-black/90 font-mono"
    >
      <div className="border-border-dim flex items-center justify-between border-b px-4 py-2">
        <span id="credits-modal-title" className="text-clover text-sm">
          Credits
        </span>
        <button
          type="button"
          className="text-dim hover:text-pink text-sm focus:outline-none"
          onClick={() => {
            playClick()
            onClose()
          }}
          onMouseEnter={playHover}
          aria-label="Close credits"
        >
          x
        </button>
      </div>
      <div
        ref={scrollRef}
        data-testid="credits-modal-scroll"
        className="scrollbar-custom min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {credits.length === 0 ? (
          <p className="text-dim text-xs">No credits yet.</p>
        ) : (
          <ul className="text-text flex flex-col gap-2 text-xs">
            {credits.map((credit, i) => (
              <li key={`${credit.name}-${String(i)}`}>
                <span className="text-text">{credit.name}</span>
                <span className="text-dim"> — </span>
                <span className="text-dim">{credit.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  )
}
