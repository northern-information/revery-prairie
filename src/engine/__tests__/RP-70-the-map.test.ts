import { describe, it } from 'vitest'

// RP-70 — The Map (permacomputer tab) and Geodetic Markers.
// Behaviors, edge cases, and failure conditions are specified in
// harness/specs/RP-70-the-map.yaml. Tests are filled in during
// implementation.
describe('RP-70 — The Map and Geodetic Markers', () => {
  it.todo('map tab is gated by manualDiscoveries item:map')
  it.todo('cellar map acquisition records item:map without entering backpack')
  it.todo('genesis seeds 10 geodetic markers (7 cellar + 3 ruins)')
  it.todo('placing a marker derives the lowest free GM-N label')
  it.todo('retrieving a marker frees its label and preserves uid')
  it.todo('placedMarkers survives a serialization round-trip')
})
