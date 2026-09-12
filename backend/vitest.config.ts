import { defineConfig } from 'vitest/config';

// Unit tests run under Vitest (Vite + esbuild), independent of the NodeNext tsc
// build. Test files import source modules WITHOUT a .js extension so Vite
// resolves straight to the .ts source; the production build still uses explicit
// .js extensions and excludes *.test.ts.
export default defineConfig({
  test: {
    environment: 'node',
    // Runs before every test file, so `config/env.ts` has what it validates
    // even where no .env exists (i.e. CI). See the file for why.
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts']
  }
});
