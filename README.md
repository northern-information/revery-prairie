# revery prairie

> To make a prairie it takes a clover and one bee,
> One clover, and a bee.
> And revery.
> The revery alone will do,
> If bees are few.

a browser-based game about tending a prairie. ASCII on canvas now, isometric sprites later.

## setup

```zsh
npm install
npm run dev
```

## how to play

1. enter your steward name
2. move with WASD or arrow keys, or click to pathfind
3. press `i` or `r` to open inventory
4. drag items onto each other in inventory to combine
5. press `e` to interact (open omniboxes, talk to characters)
6. press `esc` to close panels or open menu

## architecture

two layers:

- **`src/engine/`** — pure typescript, zero react imports. game state, rendering, input, camera. this is the layer that gets swapped when moving to sprites.
- **`src/components/` + `src/hooks/`** — react UI overlays and the bridge to the engine.

the canvas runs its own `requestAnimationFrame` loop reading game state by reference. react does not re-render on every frame — only when UI panels open/close.

## ascii

| char | meaning | color    |
| ---- | ------- | -------- |
| `@`  | player  | white    |
| `.`  | dirt    | tan      |
| `%`  | clover  | green    |
| `*`  | bee     | gold     |
| `:`  | sand    | tan-gold |
| ` `  | space   | black    |

## commands

| command              | description                   |
| -------------------- | ----------------------------- |
| `npm run dev`        | start dev server              |
| `npm run build`      | type-check + production build |
| `npm run lint`       | eslint                        |
| `npm run format`     | prettier                      |
| `npm run test`       | run tests                     |
| `npm run test:watch` | run tests in watch mode       |
| `npm run preview`    | preview production build      |
