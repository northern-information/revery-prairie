---
type: change-request
author: claude
date: 2026-04-14
---

# remove 32 dead exports

the dead export audit found 32 exports with zero importers:

**dead functions/constants (12)**: `generateAngelHashAsync`, `generateSoilHealth`, `getCloverStage`, `getGenesisEpochs`, `WATER_COLORS`, `ANGEL_CANTOS_MAX`, `BACKPACK_WIDTH`, `BACKPACK_HEIGHT`, `ACTIONBAR_SLOTS`, `windToFrontAxis`, `countHivesOnPatch`, `FONT_SCALES`

**dead type exports (17)**: types used only within their own file — remove the `export` keyword, not the type. includes `WorldEntityDefinition`, `FieldKind`, `DevPreset`, `KeyBinding`, `CaveResult`, `TickSystem`, `GameLoopCallbacks`, `GameLoop`, `PickUpResult`, `CheckCombineResult`, `CoyoteTickResult`, `PreviewTile`, `FollowBehavior`, `TrailPoint`, `DeepTimeState`, `MeteorShowerState`, `LightningState`.

**dead re-exports (3)**: `DIALOG_TRANSITION_MS` from interaction.ts, `CharMetrics` from renderer.ts, `generateBoltPath` from lightning.ts.
