import type {
  PackageManagerCapabilities,
  PackageManagerProfile,
  PackageManagerRequirements,
  PackageManagerSpec,
} from '../../types.js';
import { getSemverMajor } from '../../utils/index.js';

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
