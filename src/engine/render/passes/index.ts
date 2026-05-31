// Pass barrel. Importing this module triggers registration of every pass
// in the render pipeline (each pass module calls registerPass at the top
// level). renderer.ts imports this once so all passes are available before
// the first render() call.

// Order within a slot follows registration order; keep these grouped by slot.
// bg-cache
export { tileBgCompositePass } from './tileBgComposite'
// world-overlay
// RP-64 — registered first in world-overlay so the waterfall sits
// just above the bg cache (which carries the cliff shadow) but
// below halos/fog/film-grain.
export { waterfallFlowPass } from './waterfallFlow'
export { ruinEntranceHaloPass } from './ruinEntranceHalo'
export { angelGoldAuraPass } from './angelGoldAura'
export { prairieHaloPass } from './prairieHalo'
// fogMask must register before film grain so the grain is uniform across
// the entire viewport — explored prairie, unexplored fog, and the Space
// border all carry the same texture. (Previously fog ran last and
// stripped grain from unexplored areas, making them read as a different
// shade of black than the Space void.)
// Within a slot, registration order is preserved by the registry.
export { fogMaskPass } from './fogMask'
// Film grain runs last in world-overlay so its tile-grid covers
// everything below: bg-cache, halos, angel aura, prairie halo, fog mask.
export { filmGrainOverlayPass } from './filmGrainOverlay'
// tile-xray (RP-65 — fades occluding lifted tiles so the player avatar
// stays visible; runs between tile-glyph and entity).
export { tileXrayPass } from './tileXray'
// effect (post-tile overlays)
export { ruinEntrancePatinaPass } from './ruinEntrancePatina'
export { rainAuraOverlayPass } from './rainAuraOverlay'
export { weatherRainOverlayPass } from './weatherRainOverlay'
export { weatherSnowOverlayPass } from './weatherSnowOverlay'
export { glintingZoneSparklePass } from './glintingZoneSparkle'
export { glintingBeamPass } from './glintingBeam'
export { floraWavePass } from './floraWave'
export { lineageOverlayPass } from './lineageOverlay'
export { deepTimeBurningOverlayPass } from './deepTimeBurningOverlay'
export { pollenOverlayPass } from './pollenOverlay'
export { dragHoverTilePass } from './dragHoverTile'
export { stoneCirclesPass } from './stoneCircles'
export { burnLinePass } from './burnLine'
export { clickTargetPass } from './clickTarget'
export { fireplaceGlowPass } from './fireplaceGlow'
// RP-37 — Knot Cellar knot-glyph overlay. Stamps `§` at each archived
// alcove (plus the in-hand alcove while bedKnotPresent is true). Active
// only inside the cellar zone.
export { knotCellarKnotsPass } from './knotCellarKnots'
// screen-overlay
export { lightningScreenFlashPass } from './lightningScreenFlash'
export { angelSpawnDespawnFlashPass } from './angelSpawnDespawnFlash'
// RP-37 — Knot Cellar distance-fog mask. Linearly fades to opaque black
// past CELLAR_READ_DISTANCE; hides the far end of the corridor at all
// times. Active only inside the cellar zone.
export { knotCellarFogPass } from './knotCellarFog'
// Registered last so the zone-transition fade sits above every other
// screen-overlay. The boot title card lives as a DOM overlay
// (BootTitleCardOverlay) so it can z-index above gameplay DOM panels
// (sidebar, bottom-bar) at the handoff.
export { zoneTransitionOverlayPass } from './zoneTransitionOverlay'
