import { Zone } from './types'

export const ZONE_MUSIC: Record<Zone, string> = {
  [Zone.Overworld]: '/music/overworld.mp3',
  [Zone.Cave]: '/music/cave.mp3',
  [Zone.Ruin]: '/music/cave.mp3', // TODO: ruin-specific ambient track
  [Zone.HouseInterior]: '/music/emily.mp3',
}

const FADE_MS = 300

// Splash envelope (Northern Information colophon cue). Mirrors the
// triangle wave used by NorthernInformationSplash.tsx for visual
// opacity, so the audio gain follows the same shape. Total duration
// fits the natural length of the source mp3 (~6s) so the envelope
// reaches 0 just as the track ends.
const SPLASH_FADE_IN_MS = 2000
const SPLASH_HOLD_MS = 2400
const SPLASH_FADE_OUT_MS = 1600
const SPLASH_TOTAL_MS = SPLASH_FADE_IN_MS + SPLASH_HOLD_MS + SPLASH_FADE_OUT_MS
const SPLASH_SKIP_FADE_MS = 300

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
let splashTrack: Track | null = null
let splashRafId: number | null = null
let splashStartTime: number | null = null
let fadeRafId: number | null = null
let audioEnabled = true
let pendingResume: (() => void) | null = null

// Proximity tracks: keyed by emitter URL. Multiple emitters that share a
// URL share a track and the highest computed gain wins per tick. See
// harness/specs/proximity-music-crossfade.yaml.
const proximityTracks = new Map<string, Track>()
// URLs with an in-flight createTrack() promise — prevents duplicate spawn
// requests on consecutive ticks while the buffer is still loading.
const proximityPending = new Set<string>()
// URLs the most recent tick still wants in range. Used by the
// createTrack().then() callback to decide whether to keep or drop the
// resolved track — the closure-local targetByUrl is stale by the time
// the promise resolves.
const proximityWanted = new Set<string>()

// First-gesture primer. Modern browsers create AudioContexts in a
// 'suspended' state until a user gesture resumes them. Genesis playback
// has no required input — without an explicit primer, ambient music
// stays silent until the player happens to click something in-game.
// We register a document-level pointerdown+keydown listener on module
// load; the first gesture creates (if needed) and resumes the context,
// then removes itself. safeStart's per-track resume path remains as a
// fallback for any sequencing that races the primer.
let audioPrimed = false
const primeAudioOnFirstGesture = (): void => {
  if (audioPrimed) return
  audioPrimed = true
  const audioCtx = getContext()
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {
      // Some other path will retry.
    })
  }
  if (pendingResume) {
    const fn = pendingResume
    pendingResume = null
    fn()
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', primeAudioOnFirstGesture, { once: true, capture: true })
  document.addEventListener('keydown', primeAudioOnFirstGesture, { once: true, capture: true })
}

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

const createTrack = async (url: string, loop = true): Promise<Track> => {
  const audioCtx = getContext()
  const buffer = await loadBuffer(url)
  const gain = audioCtx.createGain()
  gain.gain.value = 0
  gain.connect(audioCtx.destination)

  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.loop = loop
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
    audioCtx
      .resume()
      .then(doStart)
      .catch(() => {
        // Autoplay blocked — retry on next user interaction
        pendingResume = () => {
          audioCtx
            .resume()
            .then(doStart)
            .catch(() => {
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
  onComplete?: () => void
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
    if (fadeOutGain) fadeOutGain.gain.value = fadeOutStart + (fadeOutTarget - fadeOutStart) * t

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
  if (!audioEnabled) {
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
    .then(track => {
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
  if (!audioEnabled) return

  // Clean up any existing dialog audio
  if (dialogTrack) {
    destroyTrack(dialogTrack)
    dialogTrack = null
  }

  void createTrack(url)
    .then(track => {
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
  cancelSplashRaf()

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

  if (splashTrack) {
    destroyTrack(splashTrack)
    splashTrack = null
  }
  splashStartTime = null

  for (const track of proximityTracks.values()) destroyTrack(track)
  proximityTracks.clear()
  proximityPending.clear()
  proximityWanted.clear()
}

// --- splash audio layer ---

const cancelSplashRaf = (): void => {
  if (splashRafId !== null) {
    cancelAnimationFrame(splashRafId)
    splashRafId = null
  }
}

const splashEnvelopeGain = (elapsed: number): number => {
  if (elapsed <= 0) return 0
  if (elapsed < SPLASH_FADE_IN_MS) return elapsed / SPLASH_FADE_IN_MS
  const holdEnd = SPLASH_FADE_IN_MS + SPLASH_HOLD_MS
  if (elapsed < holdEnd) return 1
  if (elapsed < SPLASH_TOTAL_MS) return 1 - (elapsed - holdEnd) / SPLASH_FADE_OUT_MS
  return 0
}

const startSplashEnvelope = (track: Track): void => {
  splashStartTime = performance.now()
  const step = (): void => {
    if (!splashTrack || splashStartTime === null) {
      splashRafId = null
      return
    }
    const elapsed = performance.now() - splashStartTime
    if (elapsed >= SPLASH_TOTAL_MS) {
      destroyTrack(track)
      splashTrack = null
      splashStartTime = null
      splashRafId = null
      return
    }
    track.gain.gain.value = splashEnvelopeGain(elapsed)
    splashRafId = requestAnimationFrame(step)
  }
  splashRafId = requestAnimationFrame(step)
}

export const playSplashAudio = (url: string): void => {
  if (!audioEnabled) return

  // Destroy any existing splash track (defensive — e.g. double-mount).
  if (splashTrack) {
    cancelSplashRaf()
    destroyTrack(splashTrack)
    splashTrack = null
    splashStartTime = null
  }

  void createTrack(url, false)
    .then(track => {
      // Race: a stopSplashAudio or stopAll fired between fetch start
      // and resolution. Drop the track without starting it.
      if (splashTrack !== null) {
        destroyTrack(track)
        return
      }
      splashTrack = track
      safeStart(track)
      startSplashEnvelope(track)
    })
    .catch(() => {
      // Fetch or decode failure — silent (same pattern as ambient/dialog).
    })
}

export const stopSplashAudio = (fadeMs: number = SPLASH_SKIP_FADE_MS): void => {
  if (!splashTrack) return

  cancelSplashRaf()
  const dying = splashTrack
  splashTrack = null
  splashStartTime = null

  const startGain = dying.gain.gain.value
  if (fadeMs <= 0) {
    destroyTrack(dying)
    return
  }

  const startTime = performance.now()
  const step = (): void => {
    const elapsed = performance.now() - startTime
    const t = Math.min(elapsed / fadeMs, 1)
    dying.gain.gain.value = startGain * (1 - t)
    if (t < 1) {
      splashRafId = requestAnimationFrame(step)
    } else {
      splashRafId = null
      destroyTrack(dying)
    }
  }
  splashRafId = requestAnimationFrame(step)
}

// --- proximity emitters ---

export interface ProximityEmitterSample {
  url: string
  distSq: number
  radiusSq: number
}

// Smoothstep gain curve: 0 at the boundary, 1 at the emitter tile. The
// boundary is silent (curve is 0 at t=0), so entry and exit produce no
// audible pop. Caller passes distSq/radiusSq to avoid a sqrt when the
// distance is out of range.
const computeProximityGain = (distSq: number, radiusSq: number): number => {
  if (radiusSq <= 0) return 0
  if (distSq >= radiusSq) return 0
  const t = 1 - Math.sqrt(distSq / radiusSq)
  return t * t * (3 - 2 * t)
}

// Called once per RAF tick from the engine loop. The caller queries the
// ECS for MusicEmitter components and emits one ProximityEmitterSample
// per emitter, keyed by URL. updateProximityMusic owns the track
// lifecycle: spawn on first entry, gain on every tick, destroy when no
// sample for a URL is in range.
export const updateProximityMusic = (samples: ProximityEmitterSample[]): void => {
  // Reduce samples to one target gain per URL (max across same-url emitters).
  const targetByUrl = new Map<string, number>()
  for (const sample of samples) {
    const gain = computeProximityGain(sample.distSq, sample.radiusSq)
    if (gain <= 0) continue
    const prev = targetByUrl.get(sample.url) ?? 0
    if (gain > prev) targetByUrl.set(sample.url, gain)
  }

  // Refresh the module-level "wanted" set so in-flight createTrack
  // callbacks resolved later this tick see the latest desired state.
  proximityWanted.clear()
  for (const url of targetByUrl.keys()) proximityWanted.add(url)

  // Apply gains to existing tracks; spawn new tracks for URLs not yet
  // playing. When muted, store the intended gain by spawning the track at
  // 0 and let setAudioEnabled restore on toggle.
  for (const [url, target] of targetByUrl) {
    const existing = proximityTracks.get(url)
    if (existing) {
      existing.gain.gain.value = audioEnabled ? target : 0
      continue
    }
    if (proximityPending.has(url)) continue
    proximityPending.add(url)
    void createTrack(url)
      .then(track => {
        proximityPending.delete(url)
        // If the URL went out of range during load, drop the track. The
        // module-level proximityWanted reflects the most recent tick.
        if (!proximityWanted.has(url)) {
          destroyTrack(track)
          return
        }
        // Race: a parallel call may have already populated the slot.
        if (proximityTracks.has(url)) {
          destroyTrack(track)
          return
        }
        track.gain.gain.value = 0
        proximityTracks.set(url, track)
        safeStart(track)
        // The next tick will set the real gain; do not jump to target
        // here because the player may have moved farther in the interim.
      })
      .catch(() => {
        proximityPending.delete(url)
      })
  }

  // Destroy tracks for URLs with no in-range sample this tick.
  for (const [url, track] of proximityTracks) {
    if (targetByUrl.has(url)) continue
    destroyTrack(track)
    proximityTracks.delete(url)
  }

  // Ambient ducking: dialog ducking wins; otherwise ambient gain follows
  // 1 - max(proximityGains). When all proximity tracks are silent or
  // gone, ambient returns to 1.
  if (!audioEnabled || !ambientTrack) return
  if (dialogTrack) return
  let maxGain = 0
  for (const gain of targetByUrl.values()) {
    if (gain > maxGain) maxGain = gain
  }
  // Skip if a fadeBoth is currently animating ambient (zone crossfade) —
  // it will settle to its terminal value and the next tick takes over.
  if (fadeRafId !== null) return
  ambientTrack.gain.gain.value = 1 - maxGain
}

export const setAudioEnabled = (value: boolean): void => {
  audioEnabled = value

  if (ambientTrack) ambientTrack.gain.gain.value = value ? 1 : 0
  if (dialogTrack) dialogTrack.gain.gain.value = value ? 1 : 0
  // Splash track: muting cuts immediately rather than fading, because
  // the envelope RAF will overwrite gain on the next frame anyway. On
  // re-enable, the envelope's next step restores the right value.
  if (splashTrack) splashTrack.gain.gain.value = value ? splashTrack.gain.gain.value : 0
  // Proximity tracks always start at 0 on toggle. On re-enable, the next
  // updateProximityMusic tick restores the right gain from player
  // position; leaving at 0 avoids a momentary blast at full volume.
  for (const track of proximityTracks.values()) {
    track.gain.gain.value = 0
  }

  if (value && ambientUrl && !ambientTrack) {
    // Re-create ambient if it was skipped while disabled
    setAmbient(ambientUrl, FADE_MS)
  }
}

// One-shot SFX. Fire-and-forget: each call creates a fresh non-looping
// AudioBufferSourceNode at full gain, plays immediately, and disconnects
// on onended. Overlapping calls play independently. No-op when audio is
// disabled; buffer fetch errors fail silently (same pattern as ambient).
export const playSfx = (url: string): void => {
  if (!audioEnabled) return

  const audioCtx = getContext()
  // Self-resume the AudioContext if it is still suspended. Without
  // this, an SFX triggered before any music has started (e.g. the
  // first camera-playback ceremony on a fresh page load) silently
  // no-ops because source.start cannot drive a suspended context.
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {
      // ignore — gesture policy may still block; will retry on next call
    })
  }
  void loadBuffer(url)
    .then(buffer => {
      if (!audioEnabled) return
      const source = audioCtx.createBufferSource()
      source.buffer = buffer
      source.connect(audioCtx.destination)
      source.onended = () => {
        source.disconnect()
      }
      try {
        source.start(0)
      } catch {
        // Already started or context issue — safe to ignore
      }
    })
    .catch(() => {
      // Fetch or decode failure — silent
    })
}

// --- test helpers ---

export const _getState = (): {
  ambientTrack: Track | null
  ambientUrl: string | null
  dialogTrack: Track | null
  splashTrack: Track | null
  splashRafId: number | null
  fadeRafId: number | null
  audioEnabled: boolean
  pendingResume: (() => void) | null
  proximityTracks: Map<string, Track>
  proximityPending: Set<string>
} => ({
  ambientTrack,
  ambientUrl,
  dialogTrack,
  splashTrack,
  splashRafId,
  fadeRafId,
  audioEnabled,
  pendingResume,
  proximityTracks,
  proximityPending,
})

export const _splashEnvelopeGain = splashEnvelopeGain
export const _SPLASH_TOTAL_MS = SPLASH_TOTAL_MS
export const _SPLASH_FADE_IN_MS = SPLASH_FADE_IN_MS
export const _SPLASH_HOLD_MS = SPLASH_HOLD_MS
export const _SPLASH_FADE_OUT_MS = SPLASH_FADE_OUT_MS

export const _computeProximityGain = computeProximityGain

export const _reset = (): void => {
  stopAll()
  bufferCache.clear()
  if (ctx) {
    ctx.close().catch(() => {
      // Ignore close errors
    })
    ctx = null
  }
  audioEnabled = true
}
