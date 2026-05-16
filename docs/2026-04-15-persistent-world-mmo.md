---
type: feature
author: tyler
date: 2026-04-15
---

# persistent world (MMO)

evolve the single-player prairie into a persistent shared world where 2-10 players inhabit the same prairie simultaneously. the world lives on a cloud server and persists even when nobody is playing.

## architecture summary

the core bet: **the existing engine is the server**. the pure-TypeScript engine layer, the ECS, the tick systems — they already model the world simulation. the server is just the engine running on Node.js with a WebSocket layer on top and SQLite underneath.

the client becomes a thin view: receives state, renders it, sends player intentions. renderer, pathfinding preview, and visual effects stay client-side unchanged.

## authority model

- **server authoritative** for all shared state: terrain, entities (ECS world), weather, soil, clover lifecycle, inventories, progression
- **server validates** all player actions (move, pickup, cast, craft). clients send intentions, server confirms or rejects
- **client owns** purely local state: camera, cursor, UI panels, visual effects, input state, settings

tile-based discrete positions make server authority cheap — movement validation is O(1) against a lookup table.

## networking

- **WebSocket** for bidirectional, low-latency communication
- **WorldSnapshot** on connect (full state, replaces `createGameState()`)
- **WorldDelta** at 10 Hz (batched entity/tile/weather changes, ~1-2 KB per tick)
- **optimistic movement**: client moves locally, sends to server, snaps back on rejection. imperceptible for tile-based movement
- **non-predicted actions**: pickup, craft, revery cast wait for server confirmation. avoids race conditions (two players grabbing same item)
- at 2-10 players, bandwidth is negligible (~10-20 KB/s per client). no interest management needed

## server

- single Node.js process per world. `setInterval` replaces `requestAnimationFrame`
- existing `TickSystem` interface ports directly — same systems, same intervals, same zone filtering
- server runs all simulation systems (bees, ghosts, angels, weather, clover, lightning, etc.)
- client keeps visual-only systems (dialog typing, rain fade, trail decay, preview rendering)

## persistence (SQLite)

- full world snapshot every 60s (terrain, entities, weather, world maps)
- player state every 30s + on disconnect (position, inventory, progression)
- dirty-flag optimization: only write changed data
- genesis runs once on world creation (server runs `precomputeGenesis()` synchronously)
- creating player sees genesis animation (cosmetic). joiners skip it, receive WorldSnapshot

## multiplayer presence

- other players are ECS entities with a `PlayerIdentity` component
- rendered as `@` in a distinct color. name label above
- players do NOT block each other (no collision). cooperative, not competitive
- zone transitions: players can be in different zones simultaneously. server simulates both concurrently

## conflict resolution

- **item pickup**: sequential processing. first valid `PickUp` wins, second gets rejection
- **clover harvest**: same pattern. first to harvest wins
- **simultaneous revery casts**: both succeed (idempotent terrain mutations)
- **coyote**: per-player coyote entities with `PlayerOwnership` component
- **deep time**: world event. one player triggers, all players experience the transformation

## mechanical work required

- replace 89 `Math.random()` calls across 14 engine files with seeded PRNG (existing `mulberry32` in `src/harness/prng.ts`)
- replace 17 `performance.now()` outliers with tick-system `time` parameter
- replace 6 `crypto.randomUUID()` calls with server-issued IDs
- split game loop into server-authoritative and client-visual halves
- build WebSocket server + connection management
- build client network adapter (input → server messages) and state reconciliation (server deltas → local state)
- build SQLite persistence layer
- build world creation + join flow

## open questions

- **authentication**: room code + name? accounts? OAuth? for friends, simple is better
- **world lifecycle**: run forever? archive/delete? cost of idle worlds?
- **chat**: in-world speech bubbles vs external (discord)
- **shared discoveries**: when one player discovers a recipe, unlock for all? changes the discovery loop
- **reconnection**: how long before disconnected player entity is cleaned up?
- **moderation**: host as implicit owner with kick/ban? probably unnecessary at this scale
