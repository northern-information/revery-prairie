import { Zone } from './types'

export const ZONE_MUSIC: Record<Zone, string> = {
  [Zone.Overworld]: '/music/overworld.mp3',
  [Zone.Cave]: '/music/cave.mp3',
}

const FADE_MS = 300

// --- internal state ---

let ambientAudio: HTMLAudioElement | null = null
let ambientUrl: string | null = null
let dialogAudio: HTMLAudioElement | null = null
let fadeRafId: number | null = null
let enabled = true

// --- helpers ---

const cancelFade = (): void => {
  if (fadeRafId !== null) {
    cancelAnimationFrame(fadeRafId)
    fadeRafId = null
  }
}

const createAudio = (url: string): HTMLAudioElement => {
  const el = new Audio(url)
  el.loop = true
  el.volume = 0
  el.muted = !enabled
  return el
}

let pendingPlay: HTMLAudioElement | null = null

const resumePending = (): void => {
  if (pendingPlay) {
    const el = pendingPlay
    pendingPlay = null
    el.play().catch(() => {
      // still blocked — give up silently
    })
  }
  document.removeEventListener('click', resumePending)
  document.removeEventListener('keydown', resumePending)
}

const safePlay = (el: HTMLAudioElement): void => {
  pendingPlay = null
  el.play().catch(() => {
    // autoplay blocked — retry on next user interaction
    pendingPlay = el
    document.addEventListener('click', resumePending, { once: true })
    document.addEventListener('keydown', resumePending, { once: true })
  })
}

const fadeBoth = (
  fadeIn: HTMLAudioElement | null,
  fadeInTarget: number,
  fadeOut: HTMLAudioElement | null,
  fadeOutTarget: number,
  durationMs: number,
  onComplete?: () => void,
): void => {
  cancelFade()

  if (durationMs <= 0) {
    if (fadeIn) fadeIn.volume = fadeInTarget
    if (fadeOut) fadeOut.volume = fadeOutTarget
    onComplete?.()
    return
  }

  const fadeInStart = fadeIn?.volume ?? 0
  const fadeOutStart = fadeOut?.volume ?? 0
  const startTime = performance.now()

  const step = (): void => {
    const elapsed = performance.now() - startTime
    const t = Math.min(elapsed / durationMs, 1)

    if (fadeIn) fadeIn.volume = fadeInStart + (fadeInTarget - fadeInStart) * t
    if (fadeOut) fadeOut.volume = fadeOutStart + (fadeOutTarget - fadeOutStart) * t

    if (t < 1) {
      fadeRafId = requestAnimationFrame(step)
    } else {
      fadeRafId = null
      onComplete?.()
    }
  }

  fadeRafId = requestAnimationFrame(step)
}

// --- public API ---

export const setAmbient = (url: string, fadeMs: number = FADE_MS): void => {
  if (!enabled) {
    // Track the desired URL even when muted so toggling on works
    ambientUrl = url
    return
  }

  if (url === ambientUrl && ambientAudio) return

  const oldAmbient = ambientAudio
  const newAmbient = createAudio(url)
  ambientAudio = newAmbient
  ambientUrl = url
  safePlay(newAmbient)

  fadeBoth(newAmbient, 1, oldAmbient, 0, fadeMs, () => {
    if (oldAmbient) {
      oldAmbient.pause()
      oldAmbient.src = ''
    }
  })
}

export const startDialogMusic = (url: string, fadeMs: number = FADE_MS): void => {
  if (!enabled) return

  // Clean up any existing dialog audio
  if (dialogAudio) {
    dialogAudio.pause()
    dialogAudio.src = ''
    dialogAudio = null
  }

  const el = createAudio(url)
  dialogAudio = el
  safePlay(el)

  fadeBoth(el, 1, ambientAudio, 0, fadeMs)
}

export const stopDialogMusic = (fadeMs: number = FADE_MS): void => {
  if (!dialogAudio) return

  const dying = dialogAudio
  dialogAudio = null

  fadeBoth(ambientAudio, 1, dying, 0, fadeMs, () => {
    dying.pause()
    dying.src = ''
  })
}

export const stopAll = (): void => {
  cancelFade()

  // Clear pending autoplay retry so a destroyed element is never resumed
  pendingPlay = null
  document.removeEventListener('click', resumePending)
  document.removeEventListener('keydown', resumePending)

  if (ambientAudio) {
    ambientAudio.pause()
    ambientAudio.src = ''
    ambientAudio = null
  }
  ambientUrl = null

  if (dialogAudio) {
    dialogAudio.pause()
    dialogAudio.src = ''
    dialogAudio = null
  }
}

export const setMusicEnabled = (value: boolean): void => {
  enabled = value

  if (ambientAudio) ambientAudio.muted = !value
  if (dialogAudio) dialogAudio.muted = !value

  if (value && ambientUrl && !ambientAudio) {
    // Re-create ambient if it was skipped while disabled
    setAmbient(ambientUrl, FADE_MS)
  }
}

// --- test helpers ---

export const _getState = (): {
  ambientAudio: HTMLAudioElement | null
  ambientUrl: string | null
  dialogAudio: HTMLAudioElement | null
  fadeRafId: number | null
  enabled: boolean
  pendingPlay: HTMLAudioElement | null
} => ({ ambientAudio, ambientUrl, dialogAudio, fadeRafId, enabled, pendingPlay })

export const _reset = (): void => {
  stopAll()
  enabled = true
}
