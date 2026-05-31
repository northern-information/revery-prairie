import { describe, it } from 'vitest'

// RP-67 yard zone
//
// Tests will land alongside the implementation via the plan's tasks.
// Spec: harness/specs/RP-67-little-house-yard.yaml
describe('RP-67 yard zone', () => {
  it.todo('createLittleHouseYard produces a 23x32 map with the locked layout')
  it.todo('stepping on an overworld HouseApron triggers yard enter at the gate')
  it.todo('stepping on a FenceGate exits yard back to the apron entered from')
  it.todo('stepping on HouseDoorClosed enters the house interior')
  it.todo('HouseExit in the house interior routes to the yard, not the overworld')
  it.todo('yard enter samples the 8 HouseApron tiles deterministically')
  it.todo('yard pauses state.timeOfDay and state.season')
  it.todo('Fence, HouseRoof, HouseEaves are non-walkable')
  it.todo('yard re-entry lock prevents immediate yo-yo loop')
})
