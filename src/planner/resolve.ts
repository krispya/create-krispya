import {
  resolveEngine,
  resolveMonorepoRootPackageVersions,
  resolvePackageManager,
  resolveProjectPackageVersions,
} from '../package-versions.js';
import type { ProjectPlanInput, WorkspacePlanInput } from '../types.js';
import {
  projectPlanInputToOptions,
  workspacePlanInputToMonorepoParams,
  resolveProjectPlanInput,
  resolveWorkspacePlanInput,
} from './input.js';

export async function resolveProjectFacts(input: ProjectPlanInput): Promise<ProjectPlanInput> {
  const options = projectPlanInputToOptions(input);
  options.packageManager = await resolvePackageManager(options);
  options.engine = await resolveEngine(options);
  options.versions = await resolveProjectPackageVersions(options);

  return resolveProjectPlanInput(options);
}

export async function resolveWorkspaceFacts(input: WorkspacePlanInput): Promise<WorkspacePlanInput> {
  const params = workspacePlanInputToMonorepoParams(input);
  const options = {
    name: params.name,
    linter: params.linter,
    formatter: params.formatter,
    packageManager: params.packageManager,
    engine: params.engine,
    pnpmManageVersions: params.pnpmManageVersions,
    versions: params.versions,
  };

  const packageManager = await resolvePackageManager(options);
  const engine = await resolveEngine(options);
  const versions = await resolveMonorepoRootPackageVersions({
    linter: params.linter,
    formatter: params.formatter,
    engine,
    versions: params.versions,
  });

  return resolveWorkspacePlanInput({
    ...params,
    packageManager,
    engine,
    versions,
  });
}
