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
 * Generates AI rule
 */
export function generateAiFiles(
  files: Record<string, File>,
  params: AiFilesParams
): void {
  const { platforms, isMonorepo, configStrategy, ...rest } = params;

  if (platforms.length === 0) return;

  // Generate agents content
  const content = generateWorkspace({
    ...rest,
    isMonorepo: !!isMonorepo,
    configStrategy: configStrategy ?? "stealth",
  })
  const pointer = "See [`AGENTS.md`](./Agents.md) for agent context.\n"

  const hasAgents = platforms.includes("agents")
  const hasClaude = platforms.includes("claude")
  const isSingleton = platforms.length === 1

  // Create the anchor AGENTS file
  if (hasAgents) files["AGENTS.md"] = { type: "text", content };
  
  // Generate CLAUDE file based on AGENTS file
  if (isSingleton && hasClaude) {
    files["CLAUDE.md"] = { type: "text", content };
  } else {
    files["CLAUDE.md"] = {type: "text", content: pointer}
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
      "- Use `workspace:*` for internal dependencies",
      `- New packages: \`${packageManager} create krispya <name> --workspace\``
    );
  }

  sections.push("");
  return sections.join("\n");
}
