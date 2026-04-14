---
type: change-request
author: claude
date: 2026-04-14
---

# add error isolation to game loop tick systems

the game loop iterates all registered tick systems and calls `entry.system.fn(state, time)` with no try-catch. if any single system throws, the entire `requestAnimationFrame` loop stops — the game freezes with no recovery.

wrap each system call in a try-catch that logs the error and skips the broken system. optionally disable a system after N consecutive failures to avoid log spam. this prevents a bug in e.g. the lightning system from halting movement, weather, and rendering.
