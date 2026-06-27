import { defineConfig } from 'vitest/config';

// Config used ONLY by Stryker mutation runs. Mirrors vitest.config.ts but drops
// coverage instrumentation (Stryker does its own). Keep in sync with the main
// config's test setup.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['node_modules/**', 'dist/**']
  }
});
