import type { AiPlatform, ConfigStrategy, File } from "../types.js";

export type { AiPlatform };

export const ALL_AI_PLATFORMS: AiPlatform[] = ["agents", "claude"];

export const AI_PLATFORM_LABELS: Record<AiPlatform, string> = {
  agents: "AGENTS.md",
  claude: "CLAUDE.md",
};

export const AI_PLATFORM_HINTS: Record<AiPlatform, string> = {
  agents: "OpenAI, Cursor, Windsurf, etc.",
  claude: "Claude Code",
};

export type AiFilesParams = {
  name: string;
  packageManager: string;
  linter: string;
  formatter: string;
  isMonorepo?: boolean;
  configStrategy?: ConfigStrategy;
  platforms: AiPlatform[];
};

/**
 * Generates AI rules:
 * - .ai/workspace.md (project rules)
 * - AGENTS.md and/or CLAUDE.md (pointers to .ai/)
 */
export function generateAiFiles(
  files: Record<string, File>,
  params: AiFilesParams
): void {
  const { platforms, isMonorepo, configStrategy, ...rest } = params;

  if (platforms.length === 0) return;

  // Generate .ai/workspace.md with project rules
  files[".ai/workspace.md"] = {
    type: "text",
    content: generateWorkspace({
      ...rest,
      isMonorepo: !!isMonorepo,
      configStrategy: configStrategy ?? "stealth",
    }),
  };

  // Generate pointer files
  const pointer = "See `.ai/` for project rules.\n";
  for (const platform of platforms) {
    const path = platform === "agents" ? "AGENTS.md" : "CLAUDE.md";
    files[path] = { type: "text", content: pointer };
  }
}

type WorkspaceContext = {
  name: string;
  packageManager: string;
  linter: string;
  formatter: string;
  isMonorepo: boolean;
  configStrategy: ConfigStrategy;
};

function generateWorkspace(ctx: WorkspaceContext): string {
  const { name, packageManager, linter, formatter, isMonorepo, configStrategy } =
    ctx;

  const sections: string[] = [
    `# ${name}`,
    "",
    `- **Type:** ${isMonorepo ? "pnpm monorepo" : "standalone project"}`,
    `- **Package Manager:** ${packageManager}`,
    `- **Linter:** ${linter}`,
    `- **Formatter:** ${formatter}`,
    "",
    "## Commands",
    "",
    `- \`${packageManager} test\` — run tests`,
    `- \`${packageManager} build\` — build`,
    `- \`${packageManager} lint\` and \`${packageManager} format\` — run before committing`,
  ];

  if (isMonorepo) {
    sections.push(
      "",
      "## Structure",
      "",
      "- `apps/` — applications",
      "- `packages/` — shared libraries",
      "- `.config/` — shared config packages",
      "",
      "## Monorepo",
      "",
      "- Use `workspace:*` for internal dependencies",
      `- New packages: \`${packageManager} create krispya <name> --workspace\``
    );
  } else if (configStrategy === "root") {
    sections.push(
      "",
      "## Structure",
      "",
      "- `src/` — source code",
      "- `dist/` — generated, don't edit",
      "- Config files (`tsconfig.json`, etc.) are at project root"
    );
  } else {
    sections.push(
      "",
      "## Structure",
      "",
      "- `src/` — source code",
      "- `.config/` — configs, don't move",
      "- `dist/` — generated, don't edit"
    );
  }

  sections.push("");
  return sections.join("\n");
}
