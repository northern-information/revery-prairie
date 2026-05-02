// Pass barrel. Importing this module triggers registration of every pass
// in the render pipeline (each pass module calls registerPass at the top
// level). renderer.ts imports this once so all passes are available before
// the first render() call.

// Order within a slot follows registration order; keep these grouped by slot.
// bg-cache
export { tileBgCompositePass } from './tileBgComposite'
// world-overlay
export { earthScanPass } from './earthScan'
export { ruinEntranceHaloPass } from './ruinEntranceHalo'
export { lightningTargetingRangePass } from './lightningTargetingRange'
export { angelGoldAuraPass } from './angelGoldAura'
export { prairieHaloPass } from './prairieHalo'
export { prairieOutlinePass } from './prairieOutline'
