---
type: change-request
author: Tyler
date: 2026-05-24
---

# Refine field camera

Follow-up polish pass on RP-23 (Field Camera, v9 thinktank Round 3 amendment). None of these are blockers — the feature ships functionally — but each would tighten the experience.

- A camera-specific SFX (shutter / projector ratchet) to replace the silent playback ceremony. The gel-band `/sfx/sequence.mp3` is locked to scan ceremonies only.
- Reload-rejected error feedback. The recipe currently fails silently when the player tries to drag film onto a camera with unexposed film already on it; a brief visual or audible cue would help.
- The album panel's row layout. Currently text-only after dropping the char-grid thumbnail; may want a small gel preview per row so the player can scan the album visually.
- Calendar-aware timestamp formatting in the album — _Spring · Day N · 13:42_ instead of _t = N s_. Pending a shared date helper reachable from components.
- Smarter oak selection at tenure-start when multiple oaks are equidistant to the house entrance. The current Chebyshev tie-break (lower-y, then lower-x) is deterministic but arbitrary.
- Whether the inherited camera's body should be its own distinct item id (e.g. `fieldCameraInherited`) so the album surfaces can show provenance. Currently the inherited body and a fresh one are indistinguishable in the inventory after pack-up.
