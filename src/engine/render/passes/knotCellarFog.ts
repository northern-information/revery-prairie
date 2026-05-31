// RP-37 — Knot Cellar distance-fog render pass.
//
// Overlays a per-tile alpha mask keyed on Chebyshev distance from the
// steward: full intensity within CELLAR_READ_DISTANCE, linear fade to
// black across CELLAR_FADE_DISTANCE, fully opaque beyond. Hides the
// far end of the corridor at all times so the CELLAR_ROOM_CAP is
// never visible.
//
// Stub created during /new-feature spec authoring.
export {}
