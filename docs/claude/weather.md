# weather

referenced from `CLAUDE.md`. read when touching weather drift, seasons, precipitation, or the winter palette wash.

midwest illinois prairie. weather drifts every 5 seconds. operational ranges expand seasonally: temperature -5–95°F, humidity 30–95%, wind 1–30 mph. imperial/metric toggle in sidebar.

## phenological seasons (precis #2)

`state.seasonalPhase` is a continuous `[0, 1)` clock that advances on overworld ticks only (cave and ruin zones do not advance it). a full cycle takes `SEASONAL_PHASE_PERIOD_MS` (20 minutes real-time; ~5 min per season). cardinal anchors: `0.00` = spring equinox (March 20, game start), `0.25` = summer solstice, `0.50` = autumn equinox, `0.75` = winter solstice.

`state.currentDate` is a `{ month, day }` Gregorian projection of `seasonalPhase` (anchored at day-of-year 79, fixed 365-day calendar, leap days ignored). `tickWeather` is the single writer; it recomputes every tick — even in cave/ruin zones where the phase is frozen — so reads from any zone return a consistent date.

`tickWeather` biases temperature, humidity, and wind drifts toward a seasonal mean derived from the phase via `seasonalLerp(phase, winterValue, summerValue)` in `weather/index.ts`. the lerp is `sin(2π·phase)`-based: `summerWeight = (sin + 1) / 2` peaks at the summer solstice (phase 0.25) and troughs at the winter solstice (0.75). the bias is `~0.05 * (mean - current)` per tick — strong enough to walk the year, weak enough that minute-to-minute weather stays chaotic.

`deriveSeason(temperatureF, seasonalPhase)` is the **single source of truth** for `state.weather.season`. it is called by `tickWeather` every tick. temperature extremes always win: `<38°F = Winter`, `>78°F = Summer`. in the mid-range, the phase quadrant resolves the calendar season — `[0.00, 0.25) = Spring`, `[0.25, 0.50) = Summer`, `[0.50, 0.75) = Autumn`, `[0.75, 1.00) = Winter`.

**plants follow the weather literally — no debounce.** a single-tick warm spike in deep winter genuinely transitions Dormant tiles to Healthy for that frame, then back. realistic, not averaged.

## dormancy

`FloraStage.Dormant` is a reversible stage (unlike the dying chain Brown → BlinkingRed → Black → Decomposing). when `weather.season === Winter`, the lifecycle tick transitions Healthy → Dormant. when season leaves Winter, Dormant → Healthy and `stageStartTime` resets. Dormant tiles render with the species' `dormantColor` from `FLORA_SPECIES`. clover growth previews and pollen emission are both suppressed during Winter.

## snow

`Sky.Snow` is the winter precipitation form. `pickSky` returns it instead of `Sky.Rain` when `weather.season === Winter` and humidity ≥ 75. the `weatherSnowOverlay` render pass mirrors `weatherRainOverlay` but draws slow-drifting white/grey flakes (`*`, `.`, `·`, `✦`) with a slight wind-driven horizontal sway. `state.precipitationIntensity` (renamed from `rainIntensity` in this PR) is shared: both rain and snow drive it toward 1, sun and cloudy drain it toward 0.

## winter palette wash

when `weather.season === Winter` on the overworld, the renderer applies two coordinated wash effects:

1. **bg-cache layer**: a translucent grey rect (`#B8BCC0` at 35% alpha) drawn over the freshly-composited tile-bg layer in `renderer.ts`.
2. **per-glyph wash**: every tile glyph color passes through `applyWinterWash(color)` in `tileBg.ts` (40% blend toward the same grey) before being assigned to `ctx.fillStyle`. egregore tiles (precis #8a) short-circuit the wash so the violet Voynich script pops against the grey.

cave and ruin zones are exempt from the wash entirely (player is underground).
