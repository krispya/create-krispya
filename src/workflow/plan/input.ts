import { defaultFormatterMetaConfig } from '../../defaults/formatter.js';
import { defaultLinterMetaConfig } from '../../defaults/linter.js';
import type { MonorepoParams } from '../../renderers/monorepo.js';
import type {
  ProjectOptions,
  ProjectPlanInput,
  WorkspacePlanInput,
  PackageManagerSpec,
} from '../../types.js';

export function resolveProjectPlanInput(options: ProjectOptions): ProjectPlanInput {
  const packageManager = options.packageManager ?? { name: 'pnpm' };

  return {
    project: {
      githubUserName: options.githubUserName,
      githubRepoName: options.githubRepoName,
      name: options.name,
      projectType: options.projectType,
      template: options.template,
    },
    aiAgents: {
      tool: 'ai-agents',
      config: {
        platforms: options.aiPlatforms ?? [],
      },
    },
    formatter: {
      tool: options.formatter ?? 'prettier',
      config: structuredClone(defaultFormatterMetaConfig),
    },
    linter: {
      tool: options.linter ?? 'oxlint',
      config: structuredClone(defaultLinterMetaConfig),
    },
    testing: {
      tool: options.testing ?? (options.projectType === 'library' ? 'vitest' : 'none'),
      config: {},
    },
    typescript: {
      tool: 'typescript',
      config: {
        configStrategy: options.configStrategy,
      },
    },
    ide: {
      tool: options.ide ?? 'vscode',
      config: {},
    },
    packageManager: {
      tool: packageManager.name,
      config: {
        version: packageManager.version,
        pnpmManageVersions: options.pnpmManageVersions,
      },
    },
    libraryBundler: {
      tool: options.libraryBundler ?? 'tsdown',
      config: {},
    },
    features: {
      fiber: options.fiber,
      handle: options.handle,
      drei: options.drei,
      koota: options.koota,
      leva: options.leva,
      offscreen: options.offscreen,
      postprocessing: options.postprocessing,
      rapier: options.rapier,
      triplex: options.triplex,
      viverse: options.viverse,
      uikit: options.uikit,
      xr: options.xr,
      zustand: options.zustand,
      githubPages: options.githubPages,
    },
    context: {
      dependencies: options.dependencies,
      engine: options.engine,
      files: options.files,
      injections: options.injections,
      replacements: options.replacements,
      versions: options.versions,
      workspaceRoot: options.workspaceRoot,
      workspaceDependencies: options.workspaceDependencies,
    },
  };
}

export function projectPlanInputToOptions(input: ProjectPlanInput): ProjectOptions {
  return {
    ...input.project,
    aiPlatforms:
      input.aiAgents.config.platforms.length > 0 ? input.aiAgents.config.platforms : undefined,
    formatter: input.formatter.tool,
    linter: input.linter.tool,
    testing: input.testing.tool,
    configStrategy: input.typescript.config.configStrategy,
    ide: input.ide.tool,
    packageManager: packageManagerSpecFromInput(input.packageManager),
    pnpmManageVersions: input.packageManager.config.pnpmManageVersions,
    libraryBundler: input.libraryBundler.tool,
    ...input.features,
    dependencies: input.context.dependencies,
    engine: input.context.engine,
    files: input.context.files,
    injections: input.context.injections,
    replacements: input.context.replacements,
    versions: input.context.versions,
    workspaceRoot: input.context.workspaceRoot,
    workspaceDependencies: input.context.workspaceDependencies,
  };
}

export function resolveWorkspacePlanInput(params: MonorepoParams): WorkspacePlanInput {
  return {
    project: {
      name: params.name,
    },
    aiAgents: {
      tool: 'ai-agents',
      config: {
        platforms: params.aiPlatforms ?? [],
      },
    },
    formatter: {
      tool: params.formatter,
      config: structuredClone(defaultFormatterMetaConfig),
    },
    linter: {
      tool: params.linter,
      config: structuredClone(defaultLinterMetaConfig),
    },
    ide: {
      tool: params.ide ?? 'vscode',
      config: {},
    },
    packageManager: {
      tool: params.packageManager.name,
      config: {
        version: params.packageManager.version,
        pnpmManageVersions: params.pnpmManageVersions,
      },
    },
    context: {
      engine: params.engine,
      pnpmManageVersions: params.pnpmManageVersions,
      versions: params.versions,
    },
  };
}

export function workspacePlanInputToMonorepoParams(input: WorkspacePlanInput): MonorepoParams {
  return {
    name: input.project.name,
    linter: input.linter.tool,
    formatter: input.formatter.tool,
    packageManager: packageManagerSpecFromInput(input.packageManager),
    pnpmManageVersions: input.context.pnpmManageVersions,
    engine: input.context.engine,
    versions: input.context.versions,
    aiPlatforms:
      input.aiAgents.config.platforms.length > 0 ? input.aiAgents.config.platforms : undefined,
    ide: input.ide.tool,
  };
}

export function isProjectPlanInput(
  input: ProjectOptions | ProjectPlanInput
): input is ProjectPlanInput {
  return 'project' in input && 'formatter' in input && typeof input.formatter === 'object';
}

export function isWorkspacePlanInput(
  input: MonorepoParams | WorkspacePlanInput
): input is WorkspacePlanInput {
  return 'project' in input && 'formatter' in input && typeof input.formatter === 'object';
}

function packageManagerSpecFromInput(
  packageManager: ProjectPlanInput['packageManager']
): PackageManagerSpec {
  return {
    name: packageManager.tool,
    version: packageManager.config.version,
  };
}
