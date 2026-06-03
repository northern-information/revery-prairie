import {
  _getState,
  _reset,
  _SPLASH_FADE_IN_MS,
  _SPLASH_FADE_OUT_MS,
  _SPLASH_HOLD_MS,
  _SPLASH_TOTAL_MS,
  _splashEnvelopeGain,
  playSplashAudio,
  setAmbient,
  setAudioEnabled,
  startDialogMusic,
  stopAll,
  stopDialogMusic,
  stopSplashAudio,
} from '../audio'

import type { Track } from '../audio'
import type { MockInstance } from 'vitest'

// --- Web Audio API mocks ---

class MockGainParam {
  value = 0
}

class MockGainNode {
  gain = new MockGainParam()
  connect = vi.fn()
  disconnect = vi.fn()
}

class MockAudioBufferSourceNode {
  buffer: AudioBuffer | null = null
  loop = false
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

// All MockAudioBufferSourceNodes constructed by MockAudioContext are pushed
// here so individual tests can audit every source the audio module created.
// Reset in beforeEach. A "live orphan" is a source where start has been
// called and stop has NOT — the diagnostic for the setAmbient race.
let createdSources: MockAudioBufferSourceNode[] = []

const countLiveSources = (): number =>
  createdSources.filter(s => s.start.mock.calls.length > 0 && s.stop.mock.calls.length === 0).length

class MockAudioContext {
  state = 'running'
  destination = {}
  createGain = vi.fn(() => new MockGainNode())
  createBufferSource = vi.fn(() => {
    const node = new MockAudioBufferSourceNode()
    createdSources.push(node)
    return node
  })
  decodeAudioData = vi.fn((buf: ArrayBuffer) => Promise.resolve(buf as unknown as AudioBuffer))
  resume = vi.fn(() => Promise.resolve())
  close = vi.fn(() => Promise.resolve())
}

vi.stubGlobal('AudioContext', MockAudioContext)

// Mock fetch to return an ArrayBuffer
const mockFetch = vi.fn(() =>
  Promise.resolve({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  })
)
vi.stubGlobal('fetch', mockFetch)

// Flush microtasks so createTrack resolves
const flush = async () => {
  await new Promise(r => setTimeout(r, 0))
}

// Use fake rAF that executes callbacks synchronously
let rafCallbacks: ((time: number) => void)[] = []
let rafId = 0

vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
  rafCallbacks.push(cb)
  return ++rafId
})

vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
  rafCallbacks = []
})

const flushRaf = (time: number) => {
  const cbs = [...rafCallbacks]
  rafCallbacks = []
  for (const cb of cbs) cb(time)
}

// Advance time far enough to complete any fade
const completeFade = () => {
  const now = performance.now()
  // Flush enough frames to complete 300ms fade
  for (let t = 0; t <= 350; t += 17) {
    flushRaf(now + t)
  }
}

beforeEach(async () => {
  _reset()
  await flush()
  rafCallbacks = []
  rafId = 0
  createdSources = []
  vi.restoreAllMocks()
  vi.stubGlobal('AudioContext', MockAudioContext)
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      })
    )
  )
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    rafCallbacks.push(cb)
    return ++rafId
  })
  vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
    rafCallbacks = []
  })
})

const getSource = (track: Track | null): MockAudioBufferSourceNode | null =>
  track?.source as unknown as MockAudioBufferSourceNode | null

const getGain = (track: Track | null): MockGainNode | null => (track ? (track.gain as unknown as MockGainNode) : null)

describe('audio manager', () => {
  describe('setAmbient', () => {
    it('creates a track with loop enabled', async () => {
      setAmbient('/music/overworld.mp3')
      await flush()

      const { ambientTrack, ambientUrl } = _getState()
      expect(ambientTrack).not.toBeNull()
      expect(getSource(ambientTrack)?.loop).toBe(true)
      expect(ambientUrl).toBe('/music/overworld.mp3')
    })

    it('starts the source node', async () => {
      setAmbient('/music/overworld.mp3')
      await flush()

      const { ambientTrack } = _getState()
      expect(getSource(ambientTrack)?.start).toHaveBeenCalledOnce()
    })

    it('is a no-op when same URL is already set', async () => {
      setAmbient('/music/overworld.mp3')
      await flush()
      const first = _getState().ambientTrack

      setAmbient('/music/overworld.mp3')
      await flush()
      const second = _getState().ambientTrack

      expect(first).toBe(second)
    })

    it('replaces ambient when URL changes', async () => {
      setAmbient('/music/overworld.mp3')
      await flush()
      const first = _getState().ambientTrack

      setAmbient('/music/cave.mp3')
      await flush()
      const second = _getState().ambientTrack

      expect(first).not.toBe(second)
      expect(_getState().ambientUrl).toBe('/music/cave.mp3')
    })

    it('destroys old track after crossfade completes', async () => {
      setAmbient('/music/overworld.mp3')
      await flush()
      const oldGain = getGain(_getState().ambientTrack)
      completeFade()

      setAmbient('/music/cave.mp3', 0)
      await flush()

      expect(oldGain?.disconnect).toHaveBeenCalled()
    })
  })

  describe('startDialogMusic', () => {
    it('creates a dialog track', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()

      startDialogMusic('/music/gron.mp3')
      await flush()

      const { dialogTrack } = _getState()
      expect(dialogTrack).not.toBeNull()
      expect(getSource(dialogTrack)?.loop).toBe(true)
      expect(getSource(dialogTrack)?.start).toHaveBeenCalledOnce()
    })

    it('cleans up previous dialog track', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()

      startDialogMusic('/music/gron.mp3')
      await flush()
      const firstGain = getGain(_getState().dialogTrack)

      startDialogMusic('/music/ghost.mp3')
      await flush()

      expect(firstGain?.disconnect).toHaveBeenCalled()
    })
  })

  describe('stopDialogMusic', () => {
    it('nulls dialog track after fade', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      startDialogMusic('/music/gron.mp3', 0)
      await flush()

      stopDialogMusic(0)

      const { dialogTrack } = _getState()
      expect(dialogTrack).toBeNull()
    })

    it('is a no-op when no dialog music is playing', () => {
      expect(() => {
        stopDialogMusic()
      }).not.toThrow()
    })
  })

  describe('stopAll', () => {
    it('destroys and nulls both tracks', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      startDialogMusic('/music/gron.mp3', 0)
      await flush()

      const ambientGain = getGain(_getState().ambientTrack)
      const dialogGain = getGain(_getState().dialogTrack)

      stopAll()

      expect(ambientGain?.disconnect).toHaveBeenCalled()
      expect(dialogGain?.disconnect).toHaveBeenCalled()
      expect(_getState().ambientTrack).toBeNull()
      expect(_getState().dialogTrack).toBeNull()
      expect(_getState().ambientUrl).toBeNull()
    })

    it('clears pendingResume so destroyed tracks are never resumed', async () => {
      // Simulate suspended AudioContext
      vi.stubGlobal(
        'AudioContext',
        class extends MockAudioContext {
          override state = 'suspended'
          override resume = vi.fn().mockRejectedValue(new DOMException('NotAllowedError'))
        }
      )

      setAmbient('/music/overworld.mp3', 0)
      await flush()

      expect(_getState().pendingResume).not.toBeNull()

      stopAll()

      expect(_getState().pendingResume).toBeNull()
    })

    it('allows setAmbient to re-establish audio after stopAll', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      completeFade()

      stopAll()

      // Simulates what happens on StrictMode remount
      setAmbient('/music/overworld.mp3', 0)
      await flush()

      const { ambientTrack, ambientUrl } = _getState()
      expect(ambientTrack).not.toBeNull()
      expect(ambientUrl).toBe('/music/overworld.mp3')
      expect(getSource(ambientTrack)?.start).toHaveBeenCalled()
    })
  })

  describe('setAudioEnabled', () => {
    it('mutes both tracks when disabled', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      startDialogMusic('/music/gron.mp3', 0)
      await flush()

      setAudioEnabled(false)

      const { ambientTrack, dialogTrack } = _getState()
      expect(ambientTrack?.gain.gain.value).toBe(0)
      expect(dialogTrack?.gain.gain.value).toBe(0)
    })

    it('unmutes track when enabled', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      setAudioEnabled(false)
      setAudioEnabled(true)

      const { ambientTrack } = _getState()
      expect(ambientTrack?.gain.gain.value).toBe(1)
    })

    it('tracks URL even when disabled so re-enable works', () => {
      setAudioEnabled(false)
      setAmbient('/music/overworld.mp3')

      expect(_getState().ambientUrl).toBe('/music/overworld.mp3')
    })
  })

  describe('stale URL discard', () => {
    it('discards track if ambient URL changed during load', async () => {
      setAmbient('/music/overworld.mp3', 0)
      // Immediately change before first resolves
      setAmbient('/music/cave.mp3', 0)
      await flush()

      expect(_getState().ambientUrl).toBe('/music/cave.mp3')
      expect(_getState().ambientTrack?.url).toBe('/music/cave.mp3')
    })
  })

  describe('fetch failure resilience', () => {
    it('does not crash when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

      expect(() => {
        setAmbient('/music/overworld.mp3', 0)
      }).not.toThrow()

      await flush()

      expect(_getState().ambientTrack).toBeNull()
    })
  })

  describe('buffer cache', () => {
    it('reuses cached buffer for same URL', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      completeFade()

      stopAll()

      // Reset AudioContext mock so we get a fresh one
      setAmbient('/music/overworld.mp3', 0)
      await flush()

      // fetch should only have been called once for this URL (cached buffer)
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      expect(fetchMock.mock.calls.filter((c: string[]) => c[0] === '/music/overworld.mp3')).toHaveLength(1)
    })
  })

  describe('playSplashAudio / stopSplashAudio', () => {
    type NowSpy = MockInstance<() => number>
    const advance = (nowSpy: NowSpy, t: number): void => {
      nowSpy.mockReturnValue(t)
      // Drain pending RAF callbacks so the envelope step re-reads now().
      // Each step schedules the next; flush until quiescent or capped.
      for (let i = 0; i < 20 && rafCallbacks.length > 0; i++) {
        flushRaf(t)
      }
    }

    it('exposes the expected triangle-wave envelope shape', () => {
      expect(_splashEnvelopeGain(0)).toBe(0)
      expect(_splashEnvelopeGain(_SPLASH_FADE_IN_MS / 2)).toBeCloseTo(0.5, 5)
      expect(_splashEnvelopeGain(_SPLASH_FADE_IN_MS)).toBe(1)
      expect(_splashEnvelopeGain(_SPLASH_FADE_IN_MS + _SPLASH_HOLD_MS / 2)).toBe(1)
      expect(_splashEnvelopeGain(_SPLASH_FADE_IN_MS + _SPLASH_HOLD_MS)).toBe(1)
      expect(_splashEnvelopeGain(_SPLASH_FADE_IN_MS + _SPLASH_HOLD_MS + _SPLASH_FADE_OUT_MS / 2)).toBeCloseTo(0.5, 5)
      expect(_splashEnvelopeGain(_SPLASH_TOTAL_MS)).toBe(0)
      expect(_splashEnvelopeGain(_SPLASH_TOTAL_MS + 100)).toBe(0)
    })

    it('creates a non-looping splash track on play', async () => {
      playSplashAudio('/sfx/northern-information.mp3')
      await flush()

      const { splashTrack } = _getState()
      expect(splashTrack).not.toBeNull()
      expect(getSource(splashTrack)?.loop).toBe(false)
      expect(getSource(splashTrack)?.start).toHaveBeenCalledOnce()
    })

    it('drives gain through the triangle wave as time advances', async () => {
      const nowSpy = vi.spyOn(performance, 'now')
      nowSpy.mockReturnValue(0)

      playSplashAudio('/sfx/northern-information.mp3')
      await flush()
      // Start envelope from t=0
      advance(nowSpy, 0)

      const { splashTrack } = _getState()
      expect(splashTrack).not.toBeNull()
      const gain = getGain(splashTrack)

      advance(nowSpy, _SPLASH_FADE_IN_MS / 2)
      expect(gain?.gain.value).toBeCloseTo(0.5, 5)

      advance(nowSpy, _SPLASH_FADE_IN_MS + _SPLASH_HOLD_MS / 2)
      expect(gain?.gain.value).toBe(1)

      advance(nowSpy, _SPLASH_FADE_IN_MS + _SPLASH_HOLD_MS + _SPLASH_FADE_OUT_MS / 2)
      expect(gain?.gain.value).toBeCloseTo(0.5, 5)

      nowSpy.mockRestore()
    })

    it('destroys the splash track when the envelope completes', async () => {
      const nowSpy = vi.spyOn(performance, 'now')
      nowSpy.mockReturnValue(0)

      playSplashAudio('/sfx/northern-information.mp3')
      await flush()
      advance(nowSpy, 0)

      const trackBefore = _getState().splashTrack
      const sourceBefore = getSource(trackBefore)
      expect(trackBefore).not.toBeNull()

      advance(nowSpy, _SPLASH_TOTAL_MS + 1)

      expect(_getState().splashTrack).toBeNull()
      expect(sourceBefore?.stop).toHaveBeenCalled()
      expect(sourceBefore?.disconnect).toHaveBeenCalled()

      nowSpy.mockRestore()
    })

    it('destroys a prior splash track when called again', async () => {
      playSplashAudio('/sfx/northern-information.mp3')
      await flush()
      const firstGain = getGain(_getState().splashTrack)
      expect(firstGain).not.toBeNull()

      playSplashAudio('/sfx/northern-information.mp3')
      await flush()

      expect(firstGain?.disconnect).toHaveBeenCalled()
      expect(_getState().splashTrack).not.toBeNull()
    })

    it('stopSplashAudio fades and destroys the track', async () => {
      const nowSpy = vi.spyOn(performance, 'now')
      nowSpy.mockReturnValue(0)

      playSplashAudio('/sfx/northern-information.mp3')
      await flush()
      advance(nowSpy, 0)
      advance(nowSpy, _SPLASH_FADE_IN_MS) // gain at 1
      const track = _getState().splashTrack
      const source = getSource(track)
      expect(track).not.toBeNull()

      stopSplashAudio(300)
      // splashTrack nulls immediately on stopSplashAudio
      expect(_getState().splashTrack).toBeNull()

      // Advance through the skip-fade window
      advance(nowSpy, _SPLASH_FADE_IN_MS + 400)

      expect(source?.stop).toHaveBeenCalled()
      expect(source?.disconnect).toHaveBeenCalled()

      nowSpy.mockRestore()
    })

    it('stopSplashAudio is a no-op when there is no splash track', () => {
      expect(() => {
        stopSplashAudio()
      }).not.toThrow()
      expect(_getState().splashTrack).toBeNull()
    })

    it('playSplashAudio is a no-op when audio is disabled', async () => {
      setAudioEnabled(false)
      playSplashAudio('/sfx/northern-information.mp3')
      await flush()

      expect(_getState().splashTrack).toBeNull()
      setAudioEnabled(true)
    })

    it('stopAll destroys the splash track', async () => {
      playSplashAudio('/sfx/northern-information.mp3')
      await flush()
      const gain = getGain(_getState().splashTrack)
      expect(gain).not.toBeNull()

      stopAll()

      expect(_getState().splashTrack).toBeNull()
      expect(gain?.disconnect).toHaveBeenCalled()
    })
  })

  // setAmbient race (regression: orphan tracks on rapid mount/unmount/remount).
  // The createTrack promise resolution path only checks `ambientUrl !==
  // requestedUrl` to decide whether to install the new track. When two
  // setAmbient calls are issued for the SAME url (typical sequence:
  // useMusic mounts during genesis, React StrictMode simulates an
  // unmount/remount, both mounts call setAmbient(overworld)), both
  // resolved tracks pass the url-equality guard. The second .then()
  // overwrites ambientTrack; the first track is started but unreferenced
  // and plays forever. The "Audio: Off" toggle in the settings panel
  // only mutes the currently-referenced ambientTrack, so the orphan
  // survives that path too. The fix is a per-call request token.
  describe('setAmbient race (regression: orphan tracks on rapid mount/unmount/remount)', () => {
    it('two setAmbient calls for the same URL with stopAll between leave at most one live source', async () => {
      setAmbient('/music/overworld.mp3')
      // stopAll fires before the first createTrack resolves — mirrors a
      // StrictMode cleanup mid-load.
      stopAll()
      setAmbient('/music/overworld.mp3')
      await flush()
      await flush()

      expect(countLiveSources()).toBeLessThanOrEqual(1)
    })

    it('two setAmbient calls for the same URL with no stopAll leave at most one live source', async () => {
      // Both calls fire before either createTrack resolves — mirrors a
      // remount where the previous setAmbient's promise had not yet
      // settled when the new effect runs.
      setAmbient('/music/overworld.mp3')
      setAmbient('/music/overworld.mp3')
      await flush()
      await flush()

      expect(countLiveSources()).toBeLessThanOrEqual(1)
    })

    it('setAudioEnabled(false) during a setAmbient load does not leave a track playing at gain 1', async () => {
      setAmbient('/music/overworld.mp3')
      // Toggle audio off BEFORE the createTrack resolves — the user
      // hit "Audio: Off" while genesis was still loading the track.
      setAudioEnabled(false)
      await flush()
      // Advance the fadeBoth tween so we observe the terminal gain, not
      // the initial 0 the GainNode happens to default to.
      completeFade()

      const { ambientTrack } = _getState()
      // Either the track was dropped entirely, or it was installed at
      // gain 0. The leak is a track installed at gain 1.
      if (ambientTrack !== null) {
        const gain = getGain(ambientTrack)
        expect(gain?.gain.value).toBe(0)
      }
    })
  })
})
