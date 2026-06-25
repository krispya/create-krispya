import type { PackageManagerSpec } from '../types.js';
import { getSemverMajor } from '../utils/index.js';
import type {
  PackageManagerCapabilities,
  PackageManagerProfile,
  PackageManagerRequirements,
} from './types.js';

export type PnpmWorkspaceConfigOptions = {
  profile: PackageManagerProfile;
  manageVersions?: boolean;
  packages?: string[];
  buildDependencies?: Record<string, boolean>;
};

const pnpm10Capabilities: PackageManagerCapabilities = {
  pnpmWorkspaceVersionPolicy: 'manage-package-manager-versions',
  pnpmBuildDependencyPolicy: 'onlyBuiltDependencies',
};

const pnpm10Requirements: PackageManagerRequirements = {
  node: '18.12',
};

const pnpm11Capabilities: PackageManagerCapabilities = {
  pnpmWorkspaceVersionPolicy: 'pmOnFail',
  pnpmBuildDependencyPolicy: 'allowBuilds',
};

const pnpm11Requirements: PackageManagerRequirements = {
  node: '22.13',
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

function getPnpmRequirements(major?: number): PackageManagerRequirements {
  switch (major) {
    case 10:
      return pnpm10Requirements;
    case 11:
      return pnpm11Requirements;
    default:
      if (major != null && major >= 12) return pnpm11Requirements;
      else return pnpm10Requirements;
  }
}

export function getPnpmProfile(spec: PackageManagerSpec): PackageManagerProfile {
  const major = getSemverMajor(spec.version);

  return {
    ...spec,
    major,
    capabilities: getPnpmCapabilities(major),
    requirements: getPnpmRequirements(major),
  };
}

export function renderPnpmWorkspaceConfig(options: PnpmWorkspaceConfigOptions): string {
  const {
    profile,
    manageVersions = true,
    packages = [],
    buildDependencies = { esbuild: true },
  } = options;
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
    for (const [dependency, allowed] of Object.entries(buildDependencies)) {
      lines.push(`  ${dependency}: ${allowed ? 'true' : 'false'}`);
    }
  } else {
    const allowedDependencies = Object.entries(buildDependencies)
      .filter(([, allowed]) => allowed)
      .map(([dependency]) => dependency);

    lines.push('onlyBuiltDependencies:');
    for (const dependency of allowedDependencies) {
      lines.push(`  - ${dependency}`);
    }
  }

  return lines.join('\n');
}
