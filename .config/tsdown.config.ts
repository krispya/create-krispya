import { defineConfig } from 'tsdown';

export default defineConfig({
  cwd: '..',
  entry: ['./src/index.ts', './src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: { tsconfig: 'tsconfig.build.json' },
  // Keep ESM-only runtime dependencies compatible with the package's CJS export.
  deps: { alwaysBundle: ['chalk', 'conf'], onlyBundle: false },
  clean: true,
  outExtensions: ({ format }) => ({
    js: format === 'es' ? '.mjs' : '.cjs',
    dts: '.d.ts',
  }),
});
