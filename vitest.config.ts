import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = {
  '@': new URL('./src', import.meta.url).pathname,
}

// Worker / timeout settings tuned to prevent the `Timeout calling "onTaskUpdate"`
// flake we hit on CI under load. The engine + harness suites spawn many
// createGameState calls (~1s each under contention); on the default threads
// pool, workers can starve the event loop long enough to miss the
// inter-process RPC heartbeat even when total CPU is bounded. The forks pool
// gives each worker its own process so the heartbeat is independent of test
// workload. maxForks: 2 keeps the runner (4 vCPU) well under-subscribed so a
// hot worker can't crowd out the main process reporter. teardownTimeout
// covers the post-test RPC window where the `onTaskUpdate` flake fires —
// testTimeout / hookTimeout do not govern that path.
const POOL = 'forks' as const
const POOL_OPTS = {
  forks: {
    maxForks: 2,
    minForks: 1,
  },
} as const

const TEST_TIMEOUT_MS = 30_000
const HOOK_TIMEOUT_MS = 30_000
const TEARDOWN_TIMEOUT_MS = 60_000

const COMMON = {
  pool: POOL,
  poolOptions: POOL_OPTS,
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
