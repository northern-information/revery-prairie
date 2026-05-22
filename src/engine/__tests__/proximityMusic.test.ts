import { describe, it } from 'vitest'

// Stub created alongside the proximity-music-crossfade spec.
// Implementation lands in the follow-up plan; full test coverage
// (smoothstep curve, entry/exit, ambient ducking, dialog suppression)
// is authored at that time.
describe('proximityMusic', () => {
  it.todo('computes smoothstep gain at the boundary, midpoint, and entity tile')
  it.todo('creates a track on first entry and destroys it on full exit')
  it.todo('keeps tracks for distinct urls independent')
  it.todo('ducks ambient by max(emitterGain)')
  it.todo('suppresses dialog music when the speaking character has a MusicEmitter')
})
