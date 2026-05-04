// Side-effect imports register each flora type with the movement and pollinate
// registries at module load time. Import this file once (from the renderer or
// game entry point) to activate all flora behavior.
import './type/clover/clover'

export { registerFloraMovement, getFloraMovement } from './actions/movement'
export type { FloraMovementProfile, FloraSwayOffset } from './actions/movement'
export { getFloraSwayOffset } from './actions/movement'

export { registerFloraPollinate, getFloraPollinate, MAX_POLLEN } from './actions/pollinate'
export { tickPollenDrift, tickPollenEmit, emitPlayerTrailBurst, emitPlayerFootstep } from './actions/pollinate'
