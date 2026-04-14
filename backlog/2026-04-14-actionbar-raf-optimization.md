---
type: change-request
author: claude
date: 2026-04-14
---

# optimize ActionBar rAF loop to only run during active cooldowns

`ActionBar.tsx` runs a perpetual `requestAnimationFrame` loop calling `setNow(time)` on every frame (~60 re-renders/sec) for cooldown overlay animations. this runs even when no cooldowns are active.

only start the rAF loop when at least one slot has `cooldownEndTime > now`. stop it when all cooldowns expire. this eliminates ~60 re-renders/sec during idle gameplay.
