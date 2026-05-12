import { renderMonorepo, type MonorepoParams } from '../renderers/monorepo.js';
import type { WorkspacePlanInput } from '../types.js';
import {
  isWorkspacePlanInput,
  resolveWorkspacePlanInput,
  workspacePlanInputToMonorepoParams,
} from './input.js';
import { resolveWorkspaceFacts } from './resolve.js';
import type { ProjectPlan } from './types.js';

export async function planWorkspace(
  input: MonorepoParams | WorkspacePlanInput
): Promise<ProjectPlan> {
  const planInput = isWorkspacePlanInput(input) ? input : resolveWorkspacePlanInput(input);
  const resolvedInput = await resolveWorkspaceFacts(planInput);
  const { files } = renderMonorepo(workspacePlanInputToMonorepoParams(resolvedInput));

  return {
    files,
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
