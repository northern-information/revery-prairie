import { _getState, _reset, setAmbient, startDialogMusic, stopDialogMusic, stopAll, setMusicEnabled } from '../audio'

// Mock HTMLAudioElement
class MockAudio {
  src = ''
  loop = false
  volume = 0
  muted = false
  paused = true

  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn().mockImplementation(() => {
    this.paused = true
  })
}

vi.stubGlobal('Audio', MockAudio)

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

beforeEach(() => {
  _reset()
  rafCallbacks = []
  rafId = 0
  vi.restoreAllMocks()
  vi.stubGlobal('Audio', MockAudio)
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    rafCallbacks.push(cb)
    return ++rafId
  })
  vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
    rafCallbacks = []
  })
})

describe('audio manager', () => {
  describe('setAmbient', () => {
    it('creates an audio element with loop enabled', () => {
      setAmbient('/music/overworld.mp3')

      const { ambientAudio, ambientUrl } = _getState()
      expect(ambientAudio).not.toBeNull()
      expect((ambientAudio as unknown as MockAudio).loop).toBe(true)
      expect(ambientUrl).toBe('/music/overworld.mp3')
    })

    it('calls play on the element', () => {
      setAmbient('/music/overworld.mp3')

      const { ambientAudio } = _getState()
      expect((ambientAudio as unknown as MockAudio).play).toHaveBeenCalledOnce()
    })

    it('is a no-op when same URL is already set', () => {
      setAmbient('/music/overworld.mp3')
      const first = _getState().ambientAudio

      setAmbient('/music/overworld.mp3')
      const second = _getState().ambientAudio

      expect(first).toBe(second)
    })

    it('replaces ambient when URL changes', () => {
      setAmbient('/music/overworld.mp3')
      const first = _getState().ambientAudio

      setAmbient('/music/cave.mp3')
      const second = _getState().ambientAudio

      expect(first).not.toBe(second)
      expect(_getState().ambientUrl).toBe('/music/cave.mp3')
    })

    it('pauses old ambient after crossfade completes', () => {
      setAmbient('/music/overworld.mp3')
      const old = _getState().ambientAudio as unknown as MockAudio
      completeFade()

      setAmbient('/music/cave.mp3', 0)

      expect(old.pause).toHaveBeenCalled()
    })
  })

  describe('startDialogMusic', () => {
    it('creates a dialog audio element', () => {
      setAmbient('/music/overworld.mp3', 0)

      startDialogMusic('/music/gron.mp3')

      const { dialogAudio } = _getState()
      expect(dialogAudio).not.toBeNull()
      expect((dialogAudio as unknown as MockAudio).loop).toBe(true)
      expect((dialogAudio as unknown as MockAudio).play).toHaveBeenCalledOnce()
    })

    it('cleans up previous dialog audio', () => {
      setAmbient('/music/overworld.mp3', 0)

      startDialogMusic('/music/gron.mp3')
      const first = _getState().dialogAudio as unknown as MockAudio

      startDialogMusic('/music/ghost.mp3')

      expect(first.pause).toHaveBeenCalled()
    })
  })

  describe('stopDialogMusic', () => {
    it('nulls dialog audio after fade', () => {
      setAmbient('/music/overworld.mp3', 0)
      startDialogMusic('/music/gron.mp3', 0)

      stopDialogMusic(0)

      const { dialogAudio } = _getState()
      expect(dialogAudio).toBeNull()
    })

    it('is a no-op when no dialog music is playing', () => {
      expect(() => {
        stopDialogMusic()
      }).not.toThrow()
    })
  })

  describe('stopAll', () => {
    it('pauses and nulls both elements', () => {
      setAmbient('/music/overworld.mp3', 0)
      startDialogMusic('/music/gron.mp3', 0)

      const ambient = _getState().ambientAudio as unknown as MockAudio
      const dialog = _getState().dialogAudio as unknown as MockAudio

      stopAll()

      expect(ambient.pause).toHaveBeenCalled()
      expect(dialog.pause).toHaveBeenCalled()
      expect(_getState().ambientAudio).toBeNull()
      expect(_getState().dialogAudio).toBeNull()
      expect(_getState().ambientUrl).toBeNull()
    })
  })

  describe('setMusicEnabled', () => {
    it('mutes both elements when disabled', () => {
      setAmbient('/music/overworld.mp3', 0)
      startDialogMusic('/music/gron.mp3', 0)

      setMusicEnabled(false)

      const { ambientAudio, dialogAudio } = _getState()
      expect((ambientAudio as unknown as MockAudio).muted).toBe(true)
      expect((dialogAudio as unknown as MockAudio).muted).toBe(true)
    })

    it('unmutes both elements when enabled', () => {
      setAmbient('/music/overworld.mp3', 0)
      setMusicEnabled(false)
      setMusicEnabled(true)

      const { ambientAudio } = _getState()
      expect((ambientAudio as unknown as MockAudio).muted).toBe(false)
    })

    it('tracks URL even when disabled so re-enable works', () => {
      setMusicEnabled(false)
      setAmbient('/music/overworld.mp3')

      expect(_getState().ambientUrl).toBe('/music/overworld.mp3')
    })
  })
})
