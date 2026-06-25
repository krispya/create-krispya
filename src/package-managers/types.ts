import type { PackageManagerName, PackageManagerSpec } from '../types.js';

export type PackageManagerCapabilities = {
  pnpmWorkspaceVersionPolicy?: 'manage-package-manager-versions' | 'pmOnFail';
  pnpmBuildDependencyPolicy?: 'onlyBuiltDependencies' | 'allowBuilds';
};

export type PackageManagerRequirements = {
  node?: string;
};

export type PackageManagerProfile = PackageManagerSpec & {
  major?: number;
  capabilities: PackageManagerCapabilities;
  requirements: PackageManagerRequirements;
};

export type PackageManagerIntent = {
  name: PackageManagerName;
  version?: string;
};
