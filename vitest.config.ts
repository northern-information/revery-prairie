import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = {
  '@': new URL('./src', import.meta.url).pathname,
}

// Worker / timeout settings. The engine + harness suites spawn many
// createGameState calls (~1s each under contention); on the default threads
// pool, workers can starve the event loop long enough to miss the
// inter-process RPC heartbeat even when total CPU is bounded. The forks pool
// gives each worker its own process so the heartbeat is independent of test
// workload. maxWorkers: 2 keeps the runner (4 vCPU) well under-subscribed so
// a hot worker can't crowd out the main process reporter.
//
// On vitest 3.x this config still flaked because birpc had a hardcoded 60s
// DEFAULT_TIMEOUT that fired regardless of any vitest option. The upgrade to
// vitest 4.1.7 fixed it: birpc's `timeout: -1` default (rpc.MzXet3jl.js:117)
// removes the RPC heartbeat timeout entirely. `Timeout calling onTaskUpdate`
// can no longer fire.
//
// Vitest 4 flattened poolOptions: `poolOptions.forks.maxForks` → top-level
// `maxWorkers`. `minForks` removed.
const POOL = 'forks' as const

const TEST_TIMEOUT_MS = 30_000
const HOOK_TIMEOUT_MS = 30_000
const TEARDOWN_TIMEOUT_MS = 60_000

const COMMON = {
  pool: POOL,
  maxWorkers: 2,
  testTimeout: TEST_TIMEOUT_MS,
  hookTimeout: HOOK_TIMEOUT_MS,
  teardownTimeout: TEARDOWN_TIMEOUT_MS,
} as const

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'engine',
          environment: 'node',
          globals: true,
          ...COMMON,
          include: ['src/engine/**/*.test.ts', 'src/network/**/*.test.ts'],
          exclude: ['src/engine/__tests__/audio.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'harness',
          environment: 'node',
          globals: true,
          ...COMMON,
          include: ['harness/**/*.test.ts', 'src/harness/**/*.test.ts'],
          exclude: ['src/harness/__tests__/boot/**'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'ui',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          ...COMMON,
          include: [
            'src/components/**/*.test.{ts,tsx}',
            'src/hooks/**/*.test.{ts,tsx}',
            'src/harness/__tests__/boot/**/*.test.tsx',
            'src/engine/__tests__/audio.test.ts',
          ],
        },
      },
    ],
  },
})
