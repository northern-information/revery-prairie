import { Zone } from './types'

export const ZONE_MUSIC: Record<Zone, string> = {
  [Zone.Overworld]: '/music/overworld.mp3',
  [Zone.Cave]: '/music/cave.mp3',
}

const FADE_MS = 300

// --- Track type ---

export interface Track {
  url: string
  buffer: AudioBuffer
  source: AudioBufferSourceNode | null
  gain: GainNode
}

// --- internal state ---

let ctx: AudioContext | null = null
const bufferCache = new Map<string, AudioBuffer>()
let ambientTrack: Track | null = null
let ambientUrl: string | null = null
let dialogTrack: Track | null = null
let fadeRafId: number | null = null
let enabled = true
let pendingResume: (() => void) | null = null

// --- helpers ---

const getContext = (): AudioContext => {
  ctx ??= new AudioContext()
  return ctx
}

const loadBuffer = async (url: string): Promise<AudioBuffer> => {
  const cached = bufferCache.get(url)
  if (cached) return cached

  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const audioBuffer = await getContext().decodeAudioData(arrayBuffer)
  bufferCache.set(url, audioBuffer)
  return audioBuffer
}

const createTrack = async (url: string): Promise<Track> => {
  const audioCtx = getContext()
  const buffer = await loadBuffer(url)
  const gain = audioCtx.createGain()
  gain.gain.value = 0
  gain.connect(audioCtx.destination)

  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  source.connect(gain)

  return { url, buffer, source, gain }
}

const destroyTrack = (track: Track): void => {
  if (track.source) {
    try {
      track.source.stop()
    } catch {
      // Already stopped — safe to ignore
    }
    track.source.disconnect()
  }
  track.gain.disconnect()
}

const resumePending = (): void => {
  if (pendingResume) {
    const fn = pendingResume
    pendingResume = null
    fn()
  }
  document.removeEventListener('click', resumePending)
  document.removeEventListener('keydown', resumePending)
}

const safeStart = (track: Track): void => {
  pendingResume = null

  const audioCtx = getContext()

  const doStart = (): void => {
    try {
      track.source?.start(0)
    } catch {
      // Already started — safe to ignore
    }
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(doStart).catch(() => {
      // Autoplay blocked — retry on next user interaction
      pendingResume = () => {
        audioCtx.resume().then(doStart).catch(() => {
          // Still blocked — give up silently
        })
      }
      document.addEventListener('click', resumePending, { once: true })
      document.addEventListener('keydown', resumePending, { once: true })
    })
  } else {
    doStart()
  }
}

const cancelFade = (): void => {
  if (fadeRafId !== null) {
    cancelAnimationFrame(fadeRafId)
    fadeRafId = null
  }
}

const fadeBoth = (
  fadeInGain: GainNode | null,
  fadeInTarget: number,
  fadeOutGain: GainNode | null,
  fadeOutTarget: number,
  durationMs: number,
  onComplete?: () => void,
): void => {
  cancelFade()

  if (durationMs <= 0) {
    if (fadeInGain) fadeInGain.gain.value = fadeInTarget
    if (fadeOutGain) fadeOutGain.gain.value = fadeOutTarget
    onComplete?.()
    return
  }

  const fadeInStart = fadeInGain?.gain.value ?? 0
  const fadeOutStart = fadeOutGain?.gain.value ?? 0
  const startTime = performance.now()

  const step = (): void => {
    const elapsed = performance.now() - startTime
    const t = Math.min(elapsed / durationMs, 1)

    if (fadeInGain) fadeInGain.gain.value = fadeInStart + (fadeInTarget - fadeInStart) * t
    if (fadeOutGain)
      fadeOutGain.gain.value = fadeOutStart + (fadeOutTarget - fadeOutStart) * t

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

  if (url === ambientUrl && ambientTrack) return

  const oldTrack = ambientTrack
  ambientTrack = null
  ambientUrl = url
  const requestedUrl = url

  void createTrack(url)
    .then((track) => {
      if (ambientUrl !== requestedUrl) {
        destroyTrack(track)
        return
      }
      ambientTrack = track
      safeStart(track)
      fadeBoth(track.gain, 1, oldTrack?.gain ?? null, 0, fadeMs, () => {
        if (oldTrack) destroyTrack(oldTrack)
      })
    })
    .catch(() => {
      // Fetch or decode failure — silent
    })
}

export const startDialogMusic = (url: string, fadeMs: number = FADE_MS): void => {
  if (!enabled) return

  // Clean up any existing dialog audio
  if (dialogTrack) {
    destroyTrack(dialogTrack)
    dialogTrack = null
  }

  void createTrack(url)
    .then((track) => {
      dialogTrack = track
      safeStart(track)
      fadeBoth(track.gain, 1, ambientTrack?.gain ?? null, 0, fadeMs)
    })
    .catch(() => {
      // Fetch or decode failure — silent
    })
}

export const stopDialogMusic = (fadeMs: number = FADE_MS): void => {
  if (!dialogTrack) return

  const dying = dialogTrack
  dialogTrack = null

  fadeBoth(ambientTrack?.gain ?? null, 1, dying.gain, 0, fadeMs, () => {
    destroyTrack(dying)
  })
}

export const stopAll = (): void => {
  cancelFade()

  // Clear pending autoplay retry so a destroyed track is never resumed
  pendingResume = null
  document.removeEventListener('click', resumePending)
  document.removeEventListener('keydown', resumePending)

  if (ambientTrack) {
    destroyTrack(ambientTrack)
    ambientTrack = null
  }
  ambientUrl = null

  if (dialogTrack) {
    destroyTrack(dialogTrack)
    dialogTrack = null
  }
}

export const setMusicEnabled = (value: boolean): void => {
  enabled = value

  if (ambientTrack) ambientTrack.gain.gain.value = value ? 1 : 0
  if (dialogTrack) dialogTrack.gain.gain.value = value ? 1 : 0

  if (value && ambientUrl && !ambientTrack) {
    // Re-create ambient if it was skipped while disabled
    setAmbient(ambientUrl, FADE_MS)
  }
}

// --- test helpers ---

export const _getState = (): {
  ambientTrack: Track | null
  ambientUrl: string | null
  dialogTrack: Track | null
  fadeRafId: number | null
  enabled: boolean
  pendingResume: (() => void) | null
} => ({ ambientTrack, ambientUrl, dialogTrack, fadeRafId, enabled, pendingResume })

export const _reset = (): void => {
  stopAll()
  bufferCache.clear()
  if (ctx) {
    ctx.close().catch(() => {
      // Ignore close errors
    })
    ctx = null
  }
  enabled = true
}
