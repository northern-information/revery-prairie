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
// fogMask must register last in world-overlay so its mask covers both the
// cached tile-bg AND every other world-overlay pass (earth scan, halos,
// lightning targeting range, angel aura, prairie halo).
// Within a slot, registration order is preserved by the registry.
export { fogMaskPass } from './fogMask'
// effect (post-tile overlays)
export { ruinEntrancePatinaPass } from './ruinEntrancePatina'
export { rainAuraOverlayPass } from './rainAuraOverlay'
export { reveryRainOverlayPass } from './reveryRainOverlay'
export { weatherRainOverlayPass } from './weatherRainOverlay'
export { glintingZoneSparklePass } from './glintingZoneSparkle'
export { glintingBeamPass } from './glintingBeam'
export { deepTimeBurningOverlayPass } from './deepTimeBurningOverlay'
export { pollenOverlayPass } from './pollenOverlay'
// screen-overlay
export { lightningScreenFlashPass } from './lightningScreenFlash'
export { angelSpawnDespawnFlashPass } from './angelSpawnDespawnFlash'
export { rtsSelectionBoxPass } from './rtsSelectionBox'
export { moveOrderMarkersPass } from './moveOrderMarkers'
