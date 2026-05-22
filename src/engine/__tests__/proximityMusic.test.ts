import {
  _computeProximityGain,
  _getState,
  _reset,
  setAmbient,
  setMusicEnabled,
  startDialogMusic,
  updateProximityMusic,
} from '../audio'

import type { Track } from '../audio'

// --- Web Audio API mocks (mirrors audio.test.ts) ---

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

vi.stubGlobal(
  'fetch',
  vi.fn(() =>
    Promise.resolve({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
  )
)

const flush = async () => {
  await new Promise(r => setTimeout(r, 0))
}

let rafCallbacks: ((time: number) => void)[] = []
let rafId = 0

vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
  rafCallbacks.push(cb)
  return ++rafId
})

vi.stubGlobal('cancelAnimationFrame', () => {
  rafCallbacks = []
})

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
  vi.stubGlobal('cancelAnimationFrame', () => {
    rafCallbacks = []
  })
})

const getGain = (track: Track | null | undefined): MockGainNode | null =>
  track ? (track.gain as unknown as MockGainNode) : null

describe('proximityMusic', () => {
  describe('smoothstep gain curve', () => {
    it('returns 0 at and beyond the boundary', () => {
      expect(_computeProximityGain(36, 36)).toBe(0)
      expect(_computeProximityGain(100, 36)).toBe(0)
    })

    it('returns 1 at the entity tile', () => {
      expect(_computeProximityGain(0, 36)).toBe(1)
    })

    it('returns 0.5 at the midpoint of the radius', () => {
      // distSq/radiusSq = 0.25 → t = 0.5 → smoothstep(0.5) = 0.5
      const r = 6
      const radiusSq = r * r
      const midDistSq = (r / 2) * (r / 2)
      expect(_computeProximityGain(midDistSq, radiusSq)).toBeCloseTo(0.5, 6)
    })

    it('returns 0 when radius is 0 or negative', () => {
      expect(_computeProximityGain(0, 0)).toBe(0)
      expect(_computeProximityGain(0, -4)).toBe(0)
    })

    it('is monotonically increasing from boundary to center', () => {
      const r = 10
      const radiusSq = r * r
      let prev = -1
      for (let d = r - 0.01; d >= 0; d -= 0.5) {
        const g = _computeProximityGain(d * d, radiusSq)
        expect(g).toBeGreaterThanOrEqual(prev)
        prev = g
      }
    })
  })

  describe('track lifecycle', () => {
    it('creates a track on first entry', async () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      await flush()

      const track = _getState().proximityTracks.get('/music/gron.mp3')
      expect(track).toBeDefined()
    })

    it('does not create a track when the only sample is out of range', async () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 100, radiusSq: 36 }])
      await flush()

      expect(_getState().proximityTracks.has('/music/gron.mp3')).toBe(false)
    })

    it('destroys the track on full exit', async () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      await flush()
      const gain = getGain(_getState().proximityTracks.get('/music/gron.mp3'))

      // Tick again with all samples out of range → exit.
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 100, radiusSq: 36 }])

      expect(_getState().proximityTracks.has('/music/gron.mp3')).toBe(false)
      expect(gain?.disconnect).toHaveBeenCalled()
    })

    it('destroys the track when no sample for that URL appears at all', async () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      await flush()

      updateProximityMusic([])

      expect(_getState().proximityTracks.has('/music/gron.mp3')).toBe(false)
    })

    it('keeps tracks for distinct URLs independent', async () => {
      updateProximityMusic([
        { url: '/music/gron.mp3', distSq: 4, radiusSq: 36 },
        { url: '/music/moab.mp3', distSq: 9, radiusSq: 36 },
      ])
      await flush()

      const { proximityTracks } = _getState()
      expect(proximityTracks.size).toBe(2)
      expect(proximityTracks.has('/music/gron.mp3')).toBe(true)
      expect(proximityTracks.has('/music/moab.mp3')).toBe(true)
    })

    it('shares a track between same-URL emitters and uses the max gain', async () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      await flush()
      // Now two emitters with the same URL: one close, one far.
      updateProximityMusic([
        { url: '/music/gron.mp3', distSq: 25, radiusSq: 36 },
        { url: '/music/gron.mp3', distSq: 1, radiusSq: 36 },
      ])

      const tracks = _getState().proximityTracks
      expect(tracks.size).toBe(1)
      const closeGain = _computeProximityGain(1, 36)
      expect(getGain(tracks.get('/music/gron.mp3'))?.gain.value).toBeCloseTo(closeGain, 6)
    })

    it('dedupes in-flight createTrack calls when ticked twice before the buffer loads', () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])

      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
      expect(fetchMock.mock.calls.filter((c: string[]) => c[0] === '/music/gron.mp3')).toHaveLength(1)
    })

    it('drops a track that went out of range while loading', async () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      // Before the buffer resolves, player walks away.
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 999, radiusSq: 36 }])
      await flush()

      expect(_getState().proximityTracks.has('/music/gron.mp3')).toBe(false)
    })
  })

  describe('ambient ducking', () => {
    it('ducks ambient gain to 1 - max(proximityGain)', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      // Mid-radius: smoothstep ≈ 0.5 → ambient ≈ 0.5
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 9, radiusSq: 36 }])
      await flush()
      // Re-tick now that the proximity track exists so ducking is applied
      // with the populated gain.
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 9, radiusSq: 36 }])

      const { ambientTrack } = _getState()
      expect(ambientTrack?.gain.gain.value).toBeCloseTo(1 - _computeProximityGain(9, 36), 6)
    })

    it('restores ambient to 1 when no emitters are in range', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      await flush()
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])

      // Now leave.
      updateProximityMusic([])

      const { ambientTrack } = _getState()
      expect(ambientTrack?.gain.gain.value).toBe(1)
    })

    it('does not duck ambient while dialog ducking is active', async () => {
      setAmbient('/music/overworld.mp3', 0)
      await flush()
      startDialogMusic('/music/ghost.mp3', 0)
      await flush()

      // After dialog starts, ambient gain animates toward 0 via fadeBoth.
      // updateProximityMusic must not jump it to a different value.
      const beforeValue = _getState().ambientTrack?.gain.gain.value
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      const afterValue = _getState().ambientTrack?.gain.gain.value

      expect(afterValue).toBe(beforeValue)
    })
  })

  describe('music toggle', () => {
    it('mutes proximity tracks when disabled', async () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      await flush()
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      const track = _getState().proximityTracks.get('/music/gron.mp3')
      expect(track?.gain.gain.value).toBeGreaterThan(0)

      setMusicEnabled(false)

      expect(track?.gain.gain.value).toBe(0)
    })

    it('keeps proximity tracks at 0 immediately on re-enable; next tick restores gain', async () => {
      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      await flush()
      setMusicEnabled(false)
      setMusicEnabled(true)

      const track = _getState().proximityTracks.get('/music/gron.mp3')
      expect(track?.gain.gain.value).toBe(0)

      updateProximityMusic([{ url: '/music/gron.mp3', distSq: 4, radiusSq: 36 }])
      expect(track?.gain.gain.value).toBeGreaterThan(0)
    })
  })
})
