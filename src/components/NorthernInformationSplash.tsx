import { useEffect, useRef, useState } from 'react'

const SPLASH_FADE_IN_MS = 800
const SPLASH_HOLD_MS = 1800
const SPLASH_FADE_OUT_MS = 800
const SPLASH_TOTAL_MS = SPLASH_FADE_IN_MS + SPLASH_HOLD_MS + SPLASH_FADE_OUT_MS

const SPLASH_IMAGE_SRC = '/applied-sciences-and-phantasms-working-division-flourescent.png'

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())

// Triangle wave matching BootTitleCardOverlay's overlayAlpha.
const splashAlpha = (elapsed: number): number => {
  if (elapsed <= 0) return 0
  if (elapsed < SPLASH_FADE_IN_MS) return elapsed / SPLASH_FADE_IN_MS
  const holdEnd = SPLASH_FADE_IN_MS + SPLASH_HOLD_MS
  if (elapsed < holdEnd) return 1
  if (elapsed < SPLASH_TOTAL_MS) return 1 - (elapsed - holdEnd) / SPLASH_FADE_OUT_MS
  return 0
}

interface NorthernInformationSplashProps {
  onFadeOutStart: () => void
  onComplete: () => void
}

const FADE_OUT_START_MS = SPLASH_FADE_IN_MS + SPLASH_HOLD_MS

export const NorthernInformationSplash = ({
  onFadeOutStart,
  onComplete,
}: NorthernInformationSplashProps): React.ReactElement | null => {
  const [, force] = useState(0)
  const startRef = useRef(now())
  const rafRef = useRef<number | null>(null)
  const fadeOutStartedRef = useRef(false)
  const completedRef = useRef(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    let alive = true
    const loop = (): void => {
      if (!alive) return
      const elapsed = now() - startRef.current
      if (elapsed >= FADE_OUT_START_MS && !fadeOutStartedRef.current) {
        fadeOutStartedRef.current = true
        onFadeOutStart()
      }
      if (elapsed >= SPLASH_TOTAL_MS) {
        if (!completedRef.current) {
          completedRef.current = true
          onComplete()
        }
        return
      }
      force(n => n + 1)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      alive = false
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [onFadeOutStart, onComplete])

  const elapsed = now() - startRef.current
  if (elapsed >= SPLASH_TOTAL_MS) return null
  const alpha = splashAlpha(elapsed)

  const handleImgError = (): void => {
    if (imgRef.current) imgRef.current.style.visibility = 'hidden'
  }

  return (
    <div
      data-panel="northern-information-splash"
      className="film-grain-overlay-strong fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{ opacity: alpha }}
    >
      <img
        ref={imgRef}
        src={SPLASH_IMAGE_SRC}
        alt="Northern Information"
        className="max-h-[80vh] max-w-[80vw] object-contain"
        onError={handleImgError}
      />
    </div>
  )
}
