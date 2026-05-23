import { _getState, _reset, setAmbient, setAudioEnabled, startDialogMusic, stopAll, stopDialogMusic } from '../audio'

import type { Track } from '../audio'

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

class MockAudioContext {
  state = 'running'
  destination = {}
  createGain = vi.fn(() => new MockGainNode())
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode())
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
})
