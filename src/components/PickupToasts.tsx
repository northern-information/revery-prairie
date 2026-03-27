import { TOAST_DURATION, TOAST_FADE_START } from '@/hooks/useEventLog'
import type { CharMetrics } from '@/engine/types'
import type { GameState } from '@/engine/types'
import type { GameEvent } from '@/hooks/useEventLog'

interface PickupToastsProps {
  toasts: GameEvent[]
  state: GameState
  metricsRef: React.RefObject<CharMetrics | null>
}

export const PickupToasts = ({ toasts, state, metricsRef }: PickupToastsProps) => {
  if (toasts.length === 0) return null
  const metrics = metricsRef.current
  if (!metrics) return null

  const now = Date.now()
  const fadeDuration = TOAST_DURATION - TOAST_FADE_START

  return (
    <div className="pointer-events-none fixed top-0 left-0 z-20">
      {toasts.map(toast => {
        const age = now - toast.timestamp
        const opacity = age > TOAST_FADE_START ? Math.max(0, (TOAST_DURATION - age) / fadeDuration) : 1

        const screenX = (toast.worldX - state.camera.x) * metrics.charWidth
        const screenY = (toast.worldY - state.camera.y) * metrics.charHeight - 16

        return (
          <div
            key={toast.id}
            className="text-text absolute font-mono text-xs"
            style={{
              left: screenX,
              top: screenY,
              opacity,
              textShadow: '0 0 4px #000, 0 0 4px #000',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.1s linear',
            }}
          >
            <span style={{ color: toast.iconColor }}>{toast.icon}</span> {toast.text}
          </div>
        )
      })}
    </div>
  )
}
