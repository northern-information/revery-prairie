import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = {
  '@': new URL('./src', import.meta.url).pathname,
}

// Worker / timeout settings tuned to prevent the `Timeout calling "onTaskUpdate"`
// flake we hit on CI under load. The engine suite spawns many createGameState
// calls (~1s each under contention); on the default threads pool, workers can
// starve the event loop long enough to miss the inter-process RPC heartbeat
// even when total CPU is bounded. Switching to the forks pool gives each worker
// its own process so the heartbeat is independent of test workload. Cap forks
// at the GitHub-hosted runner vCPU count (4) for the same reason as before.
const POOL = 'forks' as const
const POOL_OPTS = {
  forks: {
    maxForks: 4,
    minForks: 1,
  },
} as const

const TEST_TIMEOUT_MS = 30_000
const HOOK_TIMEOUT_MS = 30_000

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
          pool: POOL,
          poolOptions: POOL_OPTS,
          testTimeout: TEST_TIMEOUT_MS,
          hookTimeout: HOOK_TIMEOUT_MS,
          include: [
            'src/engine/**/*.test.ts',
            'src/network/**/*.test.ts',
            'harness/**/*.test.ts',
            'src/harness/**/*.test.ts',
          ],
          exclude: ['src/harness/__tests__/boot/**', 'src/engine/__tests__/audio.test.ts'],
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
          pool: POOL,
          poolOptions: POOL_OPTS,
          testTimeout: TEST_TIMEOUT_MS,
          hookTimeout: HOOK_TIMEOUT_MS,
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
