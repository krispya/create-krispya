import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { LIBRARY_BUILD_OUTPUT } from '../src/defaults/library.js';
import { planProject, resolveProjectPlanInput } from '../src/index.js';
import {
  DEFAULT_LIBRARY_BUNDLER,
  detectLibraryBundler,
  getLibraryBundler,
  isLibraryBundler,
  libraryBundlerNames,
} from '../src/library-bundlers.js';
import type { LibraryBundler, ProjectOptions, VirtualFile } from '../src/types.js';

function readTextFile(file: VirtualFile | undefined): string {
  if (file?.type !== 'text') {
    throw new Error('Expected generated file to be text');
  }

  return file.content;
}

function readPackageJson(file: VirtualFile | undefined) {
  return JSON.parse(readTextFile(file));
}

const versions = {
  '@types/node': '22.18.0',
  oxlint: '1.78.0',
  'oxlint-tsgolint': '0.22.1',
  prettier: '3.9.0',
  tsdown: '0.22.14',
  typescript: '7.0.0',
  unbuild: '3.6.1',
  vitest: '4.1.0',
};

function libraryOptions(options: Partial<ProjectOptions> = {}): ProjectOptions {
  return {
    name: 'my-lib',
    projectType: 'library',
    template: 'vanilla',
    packageManager: { name: 'pnpm', version: '11.9.0' },
    engine: { name: 'node', version: '22.18.0' },
    versions,
    ...options,
  };
}

describe('library bundlers', () => {
  it('defaults project plans to tsdown', () => {
    const input = resolveProjectPlanInput(libraryOptions());

    expect(input.libraryBundler.tool).toBe(DEFAULT_LIBRARY_BUNDLER);
  });

  it('keeps selection and detection behind the typed registry', () => {
    expect(libraryBundlerNames).toEqual(['tsdown', 'unbuild']);
    expect(isLibraryBundler('tsdown')).toBe(true);
    expect(isLibraryBundler('rollup')).toBe(false);
    expect(getLibraryBundler().name).toBe(DEFAULT_LIBRARY_BUNDLER);
    expect(
      detectLibraryBundler({
        scripts: { build: 'unbuild --config custom.ts' },
        devDependencies: { tsdown: '^0.22.14' },
      })?.name
    ).toBe('unbuild');
  });

  it('rejects unsupported bundlers through the programmatic API', () => {
    expect(() =>
      resolveProjectPlanInput(libraryOptions({ libraryBundler: 'rollup' as LibraryBundler }))
    ).toThrow('Unsupported library bundler: rollup');
  });

  it('rejects unsupported bundlers through the CLI', () => {
    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
        'src/cli.ts',
        'my-lib',
        '--type',
        'library',
        '--bundler',
        'rollup',
        '--yes',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1' },
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--bundler must be tsdown or unbuild');
  });

  it('generates a stealth tsdown build by default', async () => {
    const { files } = await planProject(libraryOptions());
    const packageJson = readPackageJson(files['package.json']);
    const config = readTextFile(files['.config/tsdown.config.ts']);

    expect(packageJson.scripts.build).toBe('tsdown --config .config/tsdown.config.ts');
    expect(packageJson.devDependencies.tsdown).toBe('^0.22.14');
    expect(packageJson.devDependencies.unbuild).toBeUndefined();
    expect(packageJson).toMatchObject({
      main: LIBRARY_BUILD_OUTPUT.main,
      module: LIBRARY_BUILD_OUTPUT.module,
      types: LIBRARY_BUILD_OUTPUT.types,
      exports: {
        '.': {
          types: LIBRARY_BUILD_OUTPUT.types,
          import: LIBRARY_BUILD_OUTPUT.import,
          require: LIBRARY_BUILD_OUTPUT.require,
        },
      },
      files: [LIBRARY_BUILD_OUTPUT.directory],
    });
    expect(files['tsdown.config.ts']).toBeUndefined();
    expect(config).toContain('cwd: ".."');
    expect(config).toContain('entry: ["./src/index.ts"]');
    expect(config).toContain('dts: { tsconfig: "tsconfig.build.json" }');
    expect(config).toContain('platform: "neutral"');
    expect(config).toContain('dts: ".d.ts"');
    expect(config).not.toContain('esbuild');
    expect(readPackageJson(files['tsconfig.build.json'])).toMatchObject({
      extends: './.config/tsconfig.app.json',
      compilerOptions: { noEmit: false },
      include: ['src'],
    });
  });

  it('keeps unbuild available when explicitly selected', async () => {
    const { files } = await planProject(libraryOptions({ libraryBundler: 'unbuild' }));
    const packageJson = readPackageJson(files['package.json']);

    expect(packageJson.scripts.build).toBe('unbuild --config .config/build.config.ts');
    expect(packageJson.devDependencies.unbuild).toBe('^3.6.1');
    expect(packageJson.devDependencies.tsdown).toBeUndefined();
    expect(readTextFile(files['.config/build.config.ts'])).toContain(
      `outDir: "${LIBRARY_BUILD_OUTPUT.directory}"`
    );
  });

  it('places tsdown config at the package root in a workspace', async () => {
    const { files } = await planProject(
      libraryOptions({ name: '@scope/my-lib', workspaceRoot: '../..' })
    );
    const packageJson = readPackageJson(files['package.json']);

    expect(packageJson.scripts.build).toBe('tsdown');
    expect(files['tsdown.config.ts']).toBeDefined();
    expect(files['.config/tsdown.config.ts']).toBeUndefined();
    expect(readPackageJson(files['tsconfig.build.json'])).toMatchObject({
      extends: './tsconfig.json',
    });
  });
});
