import type { PackageManagerName, PackageManagerSpec } from '../types.js';

export type PackageManagerCapabilities = {
  pnpmWorkspaceVersionPolicy?: 'manage-package-manager-versions' | 'pmOnFail';
  pnpmBuildDependencyPolicy?: 'onlyBuiltDependencies' | 'allowBuilds';
};

export type PackageManagerProfile = PackageManagerSpec & {
  major?: number;
  capabilities: PackageManagerCapabilities;
};

export type PackageManagerIntent = {
  name: PackageManagerName;
  version?: string;
};
