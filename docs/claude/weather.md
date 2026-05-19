# weather

referenced from `CLAUDE.md`. read when touching weather drift, seasons, precipitation, or the winter palette wash.

midwest illinois prairie. weather drifts every 5 seconds. operational ranges expand seasonally: temperature -5–95°F, humidity 30–95%, wind 1–30 mph. imperial/metric toggle in sidebar.

## phenological seasons (precis #2)

`state.seasonalPhase` is a continuous `[0, 1)` clock that advances on overworld ticks only (cave and ruin zones do not advance it). a full cycle takes `SEASONAL_PHASE_PERIOD_MS` (20 minutes real-time; ~5 min per season). the phase peaks at 0.5 for summer; 0.0 / 1.0 is deep winter.

`tickWeather` biases temperature, humidity, and wind drifts toward a seasonal mean derived from the phase via `seasonalLerp(phase, winterValue, summerValue)` in `weather/index.ts`. the bias is `~0.05 * (mean - current)` per tick — strong enough to walk the year, weak enough that minute-to-minute weather stays chaotic.

`deriveSeason(temperatureF, seasonalPhase)` is the **single source of truth** for `state.weather.season`. it is called by `tickWeather` every tick. thresholds: `<38°F = Winter`, `>78°F = Summer`. mid-range (38–78°F) resolves to Spring or Autumn based on whether the phase is rising toward or falling from summer.

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
