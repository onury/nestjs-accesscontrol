import { defineConfig } from 'vitest/config';

// Coverage is enforced at 100% on the logic surface (decorators, guard, module
// factories, permission helpers/interceptor, tokens). Type-only files (the
// barrel, http types, type defs) carry no executable logic and are excluded.
// Do not lower a threshold to make a build pass — add the missing test.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['reflect-metadata'],
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts', // barrel
        'src/http.ts', // type-only
        'src/types.ts', // type-only
        'src/**/*.{test,spec}.ts'
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100
      }
    }
  }
});
