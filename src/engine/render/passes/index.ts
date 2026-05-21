// Pass barrel. Importing this module triggers registration of every pass
// in the render pipeline (each pass module calls registerPass at the top
// level). renderer.ts imports this once so all passes are available before
// the first render() call.

// Order within a slot follows registration order; keep these grouped by slot.
// bg-cache
export { tileBgCompositePass } from './tileBgComposite'
// world-overlay
export { ruinEntranceHaloPass } from './ruinEntranceHalo'
export { angelGoldAuraPass } from './angelGoldAura'
export { prairieHaloPass } from './prairieHalo'
export { filmGrainOverlayPass } from './filmGrainOverlay'
// fogMask must register last in world-overlay so its mask covers both the
// cached tile-bg AND every other world-overlay pass (halos, angel aura,
// prairie halo, film grain).
// Within a slot, registration order is preserved by the registry.
export { fogMaskPass } from './fogMask'
// effect (post-tile overlays)
export { ruinEntrancePatinaPass } from './ruinEntrancePatina'
export { rainAuraOverlayPass } from './rainAuraOverlay'
export { weatherRainOverlayPass } from './weatherRainOverlay'
export { weatherSnowOverlayPass } from './weatherSnowOverlay'
export { glintingZoneSparklePass } from './glintingZoneSparkle'
export { glintingBeamPass } from './glintingBeam'
export { floraWavePass } from './floraWave'
export { deepTimeBurningOverlayPass } from './deepTimeBurningOverlay'
export { pollenOverlayPass } from './pollenOverlay'
export { burnLinePass } from './burnLine'
// screen-overlay
export { lightningScreenFlashPass } from './lightningScreenFlash'
export { angelSpawnDespawnFlashPass } from './angelSpawnDespawnFlash'
export { rtsSelectionBoxPass } from './rtsSelectionBox'
export { moveOrderMarkersPass } from './moveOrderMarkers'
// Registered last so the zone-transition fade sits above every other
// screen-overlay (selection box, move markers, etc.). The boot title
// card lives as a DOM overlay (BootTitleCardOverlay) so it can z-index
// above other DOM panels like the genesis bottom-right year readout.
export { zoneTransitionOverlayPass } from './zoneTransitionOverlay'
