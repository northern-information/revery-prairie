import { useEffect, useRef, useState } from 'react'

import { playSplashAudio, stopSplashAudio } from '@/engine/audio'

const SPLASH_FADE_IN_MS = 2000
const SPLASH_HOLD_MS = 2400
const SPLASH_FADE_OUT_MS = 1600
const SPLASH_TOTAL_MS = SPLASH_FADE_IN_MS + SPLASH_HOLD_MS + SPLASH_FADE_OUT_MS
const SKIP_AUDIO_FADE_MS = 300

const SPLASH_IMAGE_SRC = '/applied-sciences-and-phantasms-working-division-flourescent.png'
const SPLASH_AUDIO_SRC = '/sfx/northern-information.mp3'
const HINT_LABEL = 'Click To Begin'

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
  // Injection seam — tests pass mocks. Defaults to the real audio module.
  playAudio?: (url: string) => void
  stopAudio?: (fadeMs?: number) => void
}

const FADE_OUT_START_MS = SPLASH_FADE_IN_MS + SPLASH_HOLD_MS

export const NorthernInformationSplash = ({
  onFadeOutStart,
  onComplete,
  playAudio = playSplashAudio,
  stopAudio = stopSplashAudio,
}: NorthernInformationSplashProps): React.ReactElement | null => {
  const [started, setStarted] = useState(false)
  const [, force] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const fadeOutStartedRef = useRef(false)
  const completedRef = useRef(false)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const startedRef = useRef(false)

  // Single global keydown listener. Behaviour depends on startedRef:
  //   - pre-gesture: first keydown starts the splash + audio
  //   - running: keydown skips the splash with a fast audio fade-out
  useEffect(() => {
    const onKey = (): void => {
      if (completedRef.current) return
      if (!startedRef.current) {
        startedRef.current = true
        startRef.current = now()
        setStarted(true)
        playAudio(SPLASH_AUDIO_SRC)
        return
      }
      if (!fadeOutStartedRef.current) {
        fadeOutStartedRef.current = true
        stopAudio(SKIP_AUDIO_FADE_MS)
        onFadeOutStart()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onFadeOutStart, playAudio, stopAudio])

  // RAF loop only runs once started.
  useEffect(() => {
    if (!started) return
    let alive = true
    const loop = (): void => {
      if (!alive) return
      const start = startRef.current
      if (start === null) return
      const elapsed = now() - start
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
  }, [started, onFadeOutStart, onComplete])

  // Defensive cleanup on unmount — kills any in-flight splash audio
  // (e.g. StrictMode double-mount or hot reload mid-splash).
  useEffect(
    () => () => {
      stopAudio(0)
    },
    [stopAudio]
  )

  const handleClick = (): void => {
    if (completedRef.current) return
    if (!startedRef.current) {
      startedRef.current = true
      startRef.current = now()
      setStarted(true)
      playAudio(SPLASH_AUDIO_SRC)
      return
    }
    if (!fadeOutStartedRef.current) {
      fadeOutStartedRef.current = true
      stopAudio(SKIP_AUDIO_FADE_MS)
      onFadeOutStart()
    }
  }

  // Pre-gesture: black backdrop + film grain + hint label. No image yet.
  if (!started) {
    return (
      <div
        data-panel="northern-information-splash"
        data-state="pre-gesture"
        className="film-grain-overlay-strong fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black"
        style={{ opacity: 1 }}
        onClick={handleClick}
      >
        <span className="font-mono text-sm text-white/60 select-none">{HINT_LABEL}</span>
      </div>
    )
  }

  // Running: triangle-wave opacity over the colophon image.
  const elapsed = now() - (startRef.current ?? now())
  if (elapsed >= SPLASH_TOTAL_MS) return null
  const alpha = splashAlpha(elapsed)

  const handleImgError = (): void => {
    if (imgRef.current) imgRef.current.style.visibility = 'hidden'
  }

  return (
    <div
      data-panel="northern-information-splash"
      data-state="running"
      className="film-grain-overlay-strong fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black"
      style={{ opacity: alpha }}
      onClick={handleClick}
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
