import type { MonorepoParams, WorkspacePlanInput } from '../types.js';
import {
  isWorkspacePlanInput,
  resolveWorkspacePlanInput,
  workspacePlanInputToMonorepoParams,
} from '../intent/input.js';
import { renderMonorepo } from './renderers/monorepo.js';
import { materializeJobs } from './materialize.js';
import type { PlanJob, ProjectPlan } from './types.js';

/**
 * Pure and synchronous: expects input whose facts are already resolved
 * (see `resolveWorkspaceFacts` in the resolve stage).
 */
export function planWorkspace(input: MonorepoParams | WorkspacePlanInput): ProjectPlan {
  const planInput = isWorkspacePlanInput(input) ? input : resolveWorkspacePlanInput(input);
  const { files } = renderMonorepo(workspacePlanInputToMonorepoParams(planInput));
  const jobs: PlanJob[] = Object.entries(files).map(([path, file]) => ({
    type: 'write-file',
    path,
    file,
  }));

  return {
    files: materializeJobs(jobs),
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    scripts: {},
    vscodeSettings: {},
    vscodeExtensions: [],
    injections: [],
    replacements: [],
    warnings: [],
  };
}
