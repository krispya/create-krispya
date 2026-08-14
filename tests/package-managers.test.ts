import { describe, expect, it, vi } from 'vitest';
import {
  getPackageManagerProfile,
  parsePackageManagerSpec,
  renderPnpmWorkspaceConfig,
} from '../src/index.js';
import { resolvePackageManager } from '../src/resolve/package-manager.js';
import { getLatestNpmMajorVersion } from '../src/resolve/registry.js';

vi.mock('../src/resolve/registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/resolve/registry.js')>();
  return {
    ...actual,
    getLatestPnpmVersion: vi.fn(async () => '11.9.0'),
    getLatestYarnVersion: vi.fn(async () => '4.6.0'),
    getLatestNpmMajorVersion: vi.fn(async (_name: string, major: string) => `${major}.9.9`),
  };
});

describe('package manager specs', () => {
  it('parses package manager names and versions', () => {
    expect(parsePackageManagerSpec('pnpm')).toEqual({ name: 'pnpm' });
    expect(parsePackageManagerSpec('pnpm@11')).toEqual({ name: 'pnpm', version: '11' });
    expect(parsePackageManagerSpec('pnpm@11.2.0')).toEqual({
      name: 'pnpm',
      version: '11.2.0',
    });
    expect(parsePackageManagerSpec('npm')).toEqual({ name: 'npm' });
    expect(parsePackageManagerSpec('npm@12')).toEqual({ name: 'npm', version: '12' });
    expect(parsePackageManagerSpec('yarn@4')).toEqual({ name: 'yarn', version: '4' });
    expect(parsePackageManagerSpec('bun')).toBeUndefined();
  });

  it('profiles npm without special capabilities or requirements', () => {
    expect(getPackageManagerProfile({ name: 'npm', version: '12.0.2' })).toEqual({
      name: 'npm',
      version: '12.0.2',
      major: 12,
      capabilities: {},
      requirements: {},
    });
  });

  it('profiles modern yarn with the node-modules linker', () => {
    expect(getPackageManagerProfile({ name: 'yarn', version: '4.6.0' })).toEqual({
      name: 'yarn',
      version: '4.6.0',
      major: 4,
      capabilities: { yarnNodeLinker: 'node-modules' },
      requirements: { node: '18.12' },
    });
  });

  it('profiles yarn classic without special capabilities', () => {
    expect(getPackageManagerProfile({ name: 'yarn', version: '1.22.22' })).toEqual({
      name: 'yarn',
      version: '1.22.22',
      major: 1,
      capabilities: {},
      requirements: {},
    });
  });

  it('profiles pnpm workspace capabilities by major version', () => {
    expect(getPackageManagerProfile({ name: 'pnpm', version: '10.30.3' })).toMatchObject({
      requirements: {
        node: '18.12',
      },
      capabilities: {
        pnpmWorkspaceVersionPolicy: 'manage-package-manager-versions',
        pnpmBuildDependencyPolicy: 'onlyBuiltDependencies',
      },
    });
    expect(getPackageManagerProfile({ name: 'pnpm', version: '11.0.0' })).toMatchObject({
      requirements: {
        node: '22.13',
      },
      capabilities: {
        pnpmWorkspaceVersionPolicy: 'pmOnFail',
        pnpmBuildDependencyPolicy: 'allowBuilds',
      },
    });
    expect(getPackageManagerProfile({ name: 'pnpm', version: '12.0.0' })).toMatchObject({
      requirements: {
        node: '22.13',
      },
      capabilities: {
        pnpmWorkspaceVersionPolicy: 'pmOnFail',
        pnpmBuildDependencyPolicy: 'allowBuilds',
      },
    });
  });
});

describe('renderPnpmWorkspaceConfig', () => {
  it('renders pnpm 10 workspace settings', () => {
    expect(
      renderPnpmWorkspaceConfig({
        profile: getPackageManagerProfile({ name: 'pnpm', version: '10.30.3' }),
        packages: ['.config/*', 'apps/*', 'packages/*'],
      })
    ).toBe(`manage-package-manager-versions: true

packages:
  - ".config/*"
  - "apps/*"
  - "packages/*"

onlyBuiltDependencies:
  - esbuild`);
  });

  it('renders pnpm 11 workspace settings', () => {
    expect(
      renderPnpmWorkspaceConfig({
        profile: getPackageManagerProfile({ name: 'pnpm', version: '11.0.0' }),
        packages: ['.config/*', 'apps/*', 'packages/*'],
        buildDependencies: {
          esbuild: true,
          '@swc/core': true,
          'untrusted-package': false,
        },
      })
    ).toBe(`pmOnFail: download

packages:
  - ".config/*"
  - "apps/*"
  - "packages/*"

allowBuilds:
  esbuild: true
  "@swc/core": true
  untrusted-package: false`);
  });
});

describe('resolvePackageManager', () => {
  it('resolves the latest version for pnpm by default', async () => {
    await expect(
      resolvePackageManager({ name: 'my-app', packageManager: { name: 'pnpm' } })
    ).resolves.toEqual({ name: 'pnpm', version: '11.9.0' });
  });

  it('leaves npm unversioned unless a version is requested', async () => {
    await expect(
      resolvePackageManager({ name: 'my-app', packageManager: { name: 'npm' } })
    ).resolves.toEqual({ name: 'npm' });
  });

  it('pins npm to the latest release of a requested major', async () => {
    await expect(
      resolvePackageManager({ name: 'my-app', packageManager: { name: 'npm', version: '12' } })
    ).resolves.toEqual({ name: 'npm', version: '12.9.9' });
  });

  it('keeps fully-specified npm versions as-is', async () => {
    await expect(
      resolvePackageManager({
        name: 'my-app',
        packageManager: { name: 'npm', version: '12.0.2' },
      })
    ).resolves.toEqual({ name: 'npm', version: '12.0.2' });
  });

  it('resolves the latest modern yarn version by default', async () => {
    await expect(
      resolvePackageManager({ name: 'my-app', packageManager: { name: 'yarn' } })
    ).resolves.toEqual({ name: 'yarn', version: '4.6.0' });
  });

  it('resolves modern yarn majors from @yarnpkg/cli-dist', async () => {
    await expect(
      resolvePackageManager({ name: 'my-app', packageManager: { name: 'yarn', version: '4' } })
    ).resolves.toEqual({ name: 'yarn', version: '4.9.9' });
    expect(vi.mocked(getLatestNpmMajorVersion)).toHaveBeenLastCalledWith(
      '@yarnpkg/cli-dist',
      '4',
      '4.0.0'
    );
  });

  it('resolves yarn classic majors from the yarn package', async () => {
    await expect(
      resolvePackageManager({ name: 'my-app', packageManager: { name: 'yarn', version: '1' } })
    ).resolves.toEqual({ name: 'yarn', version: '1.9.9' });
    expect(vi.mocked(getLatestNpmMajorVersion)).toHaveBeenLastCalledWith('yarn', '1', '1.0.0');
  });
});
