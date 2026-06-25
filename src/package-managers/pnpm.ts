import type { PackageManagerSpec } from '../types.js';
import { getSemverMajor } from '../utils/index.js';
import type { PackageManagerCapabilities, PackageManagerProfile } from './types.js';

export type PnpmWorkspaceConfigOptions = {
  profile: PackageManagerProfile;
  manageVersions?: boolean;
  packages?: string[];
  builtDependencies?: string[];
};

const pnpm10Capabilities: PackageManagerCapabilities = {
  pnpmWorkspaceVersionPolicy: 'manage-package-manager-versions',
  pnpmBuildDependencyPolicy: 'onlyBuiltDependencies',
};

const pnpm11Capabilities: PackageManagerCapabilities = {
  pnpmWorkspaceVersionPolicy: 'pmOnFail',
  pnpmBuildDependencyPolicy: 'allowBuilds',
};

function getPnpmCapabilities(major?: number): PackageManagerCapabilities {
  switch (major) {
    case 10:
      return pnpm10Capabilities;
    case 11:
      return pnpm11Capabilities;
    default:
      if (major != null && major >= 12) return pnpm11Capabilities;
      else return pnpm10Capabilities;
  }
}

export function getPnpmProfile(spec: PackageManagerSpec): PackageManagerProfile {
  const major = getSemverMajor(spec.version);

  return {
    ...spec,
    major,
    capabilities: getPnpmCapabilities(major),
  };
}

export function renderPnpmWorkspaceConfig(options: PnpmWorkspaceConfigOptions): string {
  const { profile, manageVersions = true, packages = [], builtDependencies = ['esbuild'] } = options;
  const lines: string[] = [];

  if (manageVersions) {
    if (profile.capabilities.pnpmWorkspaceVersionPolicy === 'pmOnFail') {
      lines.push('pmOnFail: download', '');
    } else {
      lines.push('manage-package-manager-versions: true', '');
    }
  }

  if (packages.length > 0) {
    lines.push('packages:', ...packages.map((pattern) => `  - "${pattern}"`), '');
  }

  if (profile.capabilities.pnpmBuildDependencyPolicy === 'allowBuilds') {
    lines.push('allowBuilds:');
    for (const dependency of builtDependencies) {
      lines.push(`  ${dependency}: true`);
    }
  } else {
    lines.push('onlyBuiltDependencies:');
    for (const dependency of builtDependencies) {
      lines.push(`  - ${dependency}`);
    }
  }

  return lines.join('\n');
}
