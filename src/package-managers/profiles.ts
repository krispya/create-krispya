import type { PackageManagerSpec } from '../types.js';
import type { PackageManagerProfile } from './types.js';

function getMajor(version?: string): number | undefined {
  if (version == null) return undefined;
  const major = Number.parseInt(version, 10);
  return Number.isFinite(major) ? major : undefined;
}

export function getPackageManagerProfile(spec: PackageManagerSpec): PackageManagerProfile {
  const major = getMajor(spec.version);

  if (spec.name !== 'pnpm') {
    return {
      ...spec,
      major,
      capabilities: {},
    };
  }

  const isModernPnpm = major != null && major >= 11;

  return {
    ...spec,
    major,
    capabilities: {
      pnpmWorkspaceVersionPolicy: isModernPnpm ? 'pmOnFail' : 'manage-package-manager-versions',
      pnpmBuildDependencyPolicy: isModernPnpm ? 'allowBuilds' : 'onlyBuiltDependencies',
    },
  };
}
