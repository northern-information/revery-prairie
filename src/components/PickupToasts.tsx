import { worldToScreen } from '@/engine/projection'
import { TOAST_DURATION, TOAST_FADE_START } from '@/hooks/useEventLog'
import type { CharMetrics, GameState } from '@/engine/types'
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

  const sortedToasts = [...toasts].sort((a, b) => a.timestamp - b.timestamp)

  return (
    <div className="pointer-events-none fixed top-0 left-0 z-20">
      {sortedToasts.map((toast, i) => {
        const age = now - toast.timestamp
        const opacity = age > TOAST_FADE_START ? Math.max(0, (TOAST_DURATION - age) / fadeDuration) : 1
        const progress = age / TOAST_DURATION
        const stackOffset = (sortedToasts.length - 1 - i) * 18

        const { px, py } = worldToScreen(
          toast.worldX,
          toast.worldY,
          state.camera,
          metrics.charWidth,
          metrics.charHeight,
          state.viewportWidth,
          state.viewportHeight,
        )
        const screenX = px
        const screenY = py - 2.5 * metrics.charHeight - progress * metrics.charHeight - stackOffset

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
