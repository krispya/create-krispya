import type { AiPlatform, ConfigStrategy, Formatter, Linter, VirtualFile } from '../types.js';

export type { AiPlatform };

export const ALL_AI_PLATFORMS: AiPlatform[] = ['agents', 'claude'];

export const AI_PLATFORM_LABELS: Record<AiPlatform, string> = {
  agents: 'AGENTS.md',
  claude: 'CLAUDE.md',
};

export const AI_PLATFORM_HINTS: Record<AiPlatform, string> = {
  agents: 'OpenAI, Cursor, Windsurf, etc.',
  claude: 'Claude Code',
};

export type AiFilesParams = {
  name: string;
  packageManager: string;
  linter: Linter;
  formatter: Formatter;
  isMonorepo?: boolean;
  configStrategy?: ConfigStrategy;
  hasTypecheck?: boolean;
  platforms: AiPlatform[];
};

/**
 * Generates AI rule
 */
export function renderAiFiles(files: Record<string, VirtualFile>, params: AiFilesParams): void {
  const { platforms, isMonorepo, configStrategy, hasTypecheck, ...rest } = params;

  if (platforms.length === 0) return;

  // Generate agents content
  const content = generateWorkspace({
    ...rest,
    isMonorepo: !!isMonorepo,
    configStrategy: configStrategy ?? 'stealth',
    hasTypecheck: hasTypecheck ?? false,
  });
  const pointer = 'See [`AGENTS.md`](./Agents.md) for agent context.\n';

  const hasAgents = platforms.includes('agents');
  const hasClaude = platforms.includes('claude');
  const isSingleton = platforms.length === 1;

  // Create the anchor AGENTS file
  if (hasAgents) files['AGENTS.md'] = { type: 'text', content };

  // Generate CLAUDE file based on AGENTS file
  if (hasClaude) {
    if (isSingleton) {
      files['CLAUDE.md'] = { type: 'text', content };
    } else {
      files['CLAUDE.md'] = { type: 'text', content: pointer };
    }
  }
}

type WorkspaceContext = {
  packageManager: string;
  linter: Linter;
  formatter: Formatter;
  isMonorepo: boolean;
  configStrategy: ConfigStrategy;
  hasTypecheck: boolean;
};

function generateWorkspace(ctx: WorkspaceContext): string {
  const { packageManager, linter, formatter, hasTypecheck } = ctx;
  const exampleFiles = 'src/App.tsx src/core/systems/move-entity.ts';
  const commands = getAfterEditingCommands(ctx, exampleFiles);

  const sections: string[] = [
    '# Workspace Tools',
    '',
    `- **Package Manager:** ${packageManager}`,
    `- **Linter:** ${linter}`,
    `- **Formatter:** ${formatter}`,
    '',
    '## After Editing',
    '',
  ];

  if (hasTypecheck) {
    sections.push(
      '✅ After editing files, check the types for errors and then format and lint only the files changed for the current task.'
    );
  } else {
    sections.push(
      '✅ After editing files, format and lint only the files changed for the current task.'
    );
  }

  sections.push('', '```sh', '# Example');

  if (hasTypecheck) {
    sections.push(runScript(packageManager, 'typecheck'));
  }

  sections.push(
    '# Run format and lint for only files modified',
    commands.format,
    commands.lint,
    '```',
    '',
    '❌ Avoid unless explicitly approved:',
    '',
    '```sh',
    runScript(packageManager, 'format'),
    runScript(packageManager, 'lint'),
    '```',
    ''
  );

  return sections.join('\n');
}

function getAfterEditingCommands(
  ctx: Pick<
    WorkspaceContext,
    'packageManager' | 'linter' | 'formatter' | 'isMonorepo' | 'configStrategy'
  >,
  files: string
): { format: string; lint: string } {
  return {
    format: getFormatChangedFilesCommand(ctx, files),
    lint: getLintChangedFilesCommand(ctx, files),
  };
}

function getFormatChangedFilesCommand(
  ctx: Pick<WorkspaceContext, 'packageManager' | 'formatter' | 'isMonorepo' | 'configStrategy'>,
  files: string
): string {
  const exec = getExecCommand(ctx.packageManager);

  if (ctx.formatter === 'prettier') {
    const configPath = getPrettierConfigPath(ctx);
    const ignorePath = getPrettierIgnorePath(ctx);
    const configFlag = configPath == null ? '' : ` --config ${configPath}`;
    const ignoreFlag = ignorePath == null ? '' : ` --ignore-path ${ignorePath}`;

    return `${exec} prettier${configFlag}${ignoreFlag} --write ${files}`;
  }

  if (ctx.formatter === 'oxfmt') {
    const configPath = getOxfmtConfigPath(ctx);

    return `${exec} oxfmt -c ${configPath} --write ${files}`;
  }

  const configFlag = ctx.isMonorepo || ctx.configStrategy === 'root' ? '' : ' --config-path .config';
  return `${exec} biome format${configFlag} --write ${files}`;
}

function getLintChangedFilesCommand(
  ctx: Pick<WorkspaceContext, 'packageManager' | 'linter' | 'isMonorepo' | 'configStrategy'>,
  files: string
): string {
  const exec = getExecCommand(ctx.packageManager);

  if (ctx.linter === 'oxlint') {
    if (!ctx.isMonorepo) {
      return runScript(ctx.packageManager, 'lint', files);
    }

    return `${exec} oxlint ${files}`;
  }

  if (ctx.linter === 'eslint') {
    const configFlag = ctx.configStrategy === 'stealth' ? ' --config .config/eslint.config.js' : '';

    return `${exec} eslint${configFlag} ${files}`;
  }

  const configFlag = ctx.isMonorepo || ctx.configStrategy === 'root' ? '' : ' --config-path .config';
  return `${exec} biome lint${configFlag} ${files}`;
}

function getPrettierConfigPath(
  ctx: Pick<WorkspaceContext, 'isMonorepo' | 'configStrategy'>
): string | undefined {
  if (ctx.isMonorepo) return '.config/prettier/base.json';
  if (ctx.configStrategy === 'stealth') return '.config/prettier.json';
  return undefined;
}

function getPrettierIgnorePath(
  ctx: Pick<WorkspaceContext, 'isMonorepo' | 'configStrategy'>
): string | undefined {
  if (ctx.isMonorepo) return '.config/prettier/prettierignore';
  if (ctx.configStrategy === 'stealth') return '.config/prettierignore';
  return undefined;
}

function getOxfmtConfigPath(ctx: Pick<WorkspaceContext, 'isMonorepo' | 'configStrategy'>): string {
  if (ctx.isMonorepo) return '.config/oxfmt/base.json';
  if (ctx.configStrategy === 'stealth') return '.config/oxfmt.json';
  return 'oxfmt.json';
}

function runScript(packageManager: string, script: string, args?: string): string {
  const suffix = args == null ? '' : ` ${args}`;

  if (packageManager === 'npm') {
    return `npm run ${script}${args == null ? '' : ` --${suffix}`}`;
  }

  if (packageManager === 'yarn') {
    return `yarn ${script}${suffix}`;
  }

  return `${packageManager} ${script}${args == null ? '' : ` --${suffix}`}`;
}

function getExecCommand(packageManager: string): string {
  if (packageManager === 'npm') return 'npm exec --';
  if (packageManager === 'yarn') return 'yarn exec';
  return `${packageManager} exec`;
}
