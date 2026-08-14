import type { EngineSpec, PackageManagerProfile, PackageVersions } from '../types.js';
import type { ProjectIntent, WorkspaceIntent } from '../intent/types.js';

export type ResolvedProject = ProjectIntent & {
  packageManagerProfile: PackageManagerProfile;
  engine?: EngineSpec;
  versions?: PackageVersions;
};

export type ResolvedWorkspace = WorkspaceIntent & {
  packageManagerProfile: PackageManagerProfile;
  engine?: EngineSpec;
  versions?: PackageVersions;
};
