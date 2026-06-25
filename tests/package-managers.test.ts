import { describe, expect, it } from 'vitest';
import {
  getPackageManagerProfile,
  parsePackageManagerSpec,
  renderPnpmWorkspaceConfig,
} from '../src/index.js';

describe('package manager specs', () => {
  it('parses package manager names and versions', () => {
    expect(parsePackageManagerSpec('pnpm')).toEqual({ name: 'pnpm' });
    expect(parsePackageManagerSpec('pnpm@11')).toEqual({ name: 'pnpm', version: '11' });
    expect(parsePackageManagerSpec('pnpm@11.2.0')).toEqual({
      name: 'pnpm',
      version: '11.2.0',
    });
    expect(parsePackageManagerSpec('bun')).toBeUndefined();
  });

  it('profiles pnpm workspace capabilities by major version', () => {
    expect(getPackageManagerProfile({ name: 'pnpm', version: '10.30.3' }).capabilities).toEqual({
      pnpmWorkspaceVersionPolicy: 'manage-package-manager-versions',
      pnpmBuildDependencyPolicy: 'onlyBuiltDependencies',
    });
    expect(getPackageManagerProfile({ name: 'pnpm', version: '11.0.0' }).capabilities).toEqual({
      pnpmWorkspaceVersionPolicy: 'pmOnFail',
      pnpmBuildDependencyPolicy: 'allowBuilds',
    });
    expect(getPackageManagerProfile({ name: 'pnpm', version: '12.0.0' }).capabilities).toEqual({
      pnpmWorkspaceVersionPolicy: 'pmOnFail',
      pnpmBuildDependencyPolicy: 'allowBuilds',
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
      })
    ).toBe(`pmOnFail: download

packages:
  - ".config/*"
  - "apps/*"
  - "packages/*"

allowBuilds:
  esbuild: true`);
  });
});
