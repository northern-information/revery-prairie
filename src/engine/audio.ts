import { Zone } from './types'

export const ZONE_MUSIC: Record<Zone, string> = {
  [Zone.Overworld]: '/music/overworld.mp3',
  [Zone.Cave]: '/music/cave.mp3',
  [Zone.Ruin]: '/music/cave.mp3', // TODO: ruin-specific ambient track
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

// Proximity tracks: keyed by emitter URL. Multiple emitters that share a
// URL share a track and the highest computed gain wins per tick. See
// harness/specs/proximity-music-crossfade.yaml.
const proximityTracks = new Map<string, Track>()
// URLs with an in-flight createTrack() promise — prevents duplicate spawn
// requests on consecutive ticks while the buffer is still loading.
const proximityPending = new Set<string>()

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
  if (!enabled) return

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

  for (const track of proximityTracks.values()) destroyTrack(track)
  proximityTracks.clear()
  proximityPending.clear()
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

  // Apply gains to existing tracks; spawn new tracks for URLs not yet
  // playing. When muted, store the intended gain by spawning the track at
  // 0 and let setMusicEnabled restore on toggle.
  for (const [url, target] of targetByUrl) {
    const existing = proximityTracks.get(url)
    if (existing) {
      existing.gain.gain.value = enabled ? target : 0
      continue
    }
    if (proximityPending.has(url)) continue
    proximityPending.add(url)
    void createTrack(url)
      .then(track => {
        proximityPending.delete(url)
        // If the URL went out of range while loading, drop the track.
        const stillWanted = targetByUrl.has(url) || proximityTracks.has(url)
        if (!stillWanted) {
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
  if (!enabled || !ambientTrack) return
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

export const setMusicEnabled = (value: boolean): void => {
  enabled = value

  if (ambientTrack) ambientTrack.gain.gain.value = value ? 1 : 0
  if (dialogTrack) dialogTrack.gain.gain.value = value ? 1 : 0
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

// --- test helpers ---

export const _getState = (): {
  ambientTrack: Track | null
  ambientUrl: string | null
  dialogTrack: Track | null
  fadeRafId: number | null
  enabled: boolean
  pendingResume: (() => void) | null
  proximityTracks: Map<string, Track>
  proximityPending: Set<string>
} => ({ ambientTrack, ambientUrl, dialogTrack, fadeRafId, enabled, pendingResume, proximityTracks, proximityPending })

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
  enabled = true
}
