import type { PackageManagerSpec, ProjectOptions } from '../../types.js';

export type ProjectIntent = Omit<ProjectOptions, 'packageManager'> & {
  packageManager?: PackageManagerSpec;
};

export type WorkspaceIntent = Pick<
  ProjectIntent,
  'name' | 'linter' | 'formatter' | 'packageManager' | 'pnpmManageVersions' | 'engine' | 'versions'
>;
