export const LIBRARY_BUILD_OUTPUT = {
  directory: 'dist',
  main: './dist/index.mjs',
  module: './dist/index.mjs',
  types: './dist/index.d.ts',
  import: './dist/index.mjs',
  require: './dist/index.cjs',
  extensions: {
    esm: '.mjs',
    cjs: '.cjs',
    declarations: '.d.ts',
  },
} as const;
