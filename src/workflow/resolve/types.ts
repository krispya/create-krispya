import type { EngineSpec, PackageVersions } from '../../types.js';
import type { PackageManagerProfile } from '../../package-managers/index.js';
import type { ProjectIntent, WorkspaceIntent } from '../intent/index.js';

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
