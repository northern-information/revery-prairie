import { describe, it } from 'vitest'

// RP-19 soil depletion — test bodies are authored by the harness plan
// against harness/specs/soil-depletion.yaml. This file exists so the
// spec validator can resolve verification.test_file.
describe('soil depletion', () => {
  it.todo('per-plant spawn effect (clover credit / wildflower + tall grass debit)')
  it.todo('genesis-seeded flora skips spawn effect')
  it.todo('soil effect survives stress recovery (no double-fire)')
  it.todo('burnt-recovering defers spawn effect')
  it.todo('death enrichment unchanged')
  it.todo('clamps at [0, SOIL_HEALTH_MAX]')
  it.todo('cave flora applies spawn effect before stress transition')
  it.todo('winter-spawned flora defers spawn effect until thaw')
  it.todo('dormant thaw does not double-fire')
  it.todo('serialization round-trip preserves soilEffectApplied')
})
