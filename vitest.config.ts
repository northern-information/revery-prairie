import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = {
  '@': new URL('./src', import.meta.url).pathname,
}

// Worker / timeout settings tuned to prevent the `Timeout calling "onTaskUpdate"`
// flake we hit on CI under load. The engine suite spawns many createGameState
// calls (~1s each under contention); when vitest's default thread pool spawns
// more workers than the runner has vCPUs (GitHub-hosted runners = 4), workers
// stall waiting for CPU and miss the default rpc heartbeat. Capping threads
// matches CI vCPU count and gives slow tests room without changing semantics.
const POOL_OPTS = {
  threads: {
    maxThreads: 4,
    minThreads: 1,
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
