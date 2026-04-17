import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const alias = {
  '@': new URL('./src', import.meta.url).pathname,
}

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
          include: [
            'src/engine/**/*.test.ts',
            'harness/**/*.test.ts',
            'src/harness/**/*.test.ts',
          ],
          exclude: [
            'src/harness/__tests__/boot/**',
            'src/engine/__tests__/audio.test.ts',
          ],
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
