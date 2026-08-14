import { describe, expect, it } from 'vitest';
import { planProject, resolveProjectPlanInput } from '../src/index.js';
import type { ProjectOptions, VirtualFile } from '../src/types.js';

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

    expect(input.libraryBundler.tool).toBe('tsdown');
  });

  it('generates a stealth tsdown build by default', async () => {
    const { files } = await planProject(libraryOptions());
    const packageJson = readPackageJson(files['package.json']);
    const config = readTextFile(files['.config/tsdown.config.ts']);

    expect(packageJson.scripts.build).toBe('tsdown --config .config/tsdown.config.ts');
    expect(packageJson.devDependencies.tsdown).toBe('^0.22.14');
    expect(packageJson.devDependencies.unbuild).toBeUndefined();
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
    expect(files['.config/build.config.ts']).toBeDefined();
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
