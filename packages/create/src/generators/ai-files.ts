import type { AiFileChoice, File } from "../types.js";

export type AiFilesParams = {
  name: string;
  packageManager: string;
  linter: string;
  formatter: string;
  aiFiles: AiFileChoice[];
  /** Whether this is a monorepo workspace (affects content) */
  isMonorepo?: boolean;
};

/**
 * Generates AI instruction files for the project.
 */
export function generateAiFiles(
  files: Record<string, File>,
  params: AiFilesParams
): void {
  const { aiFiles, isMonorepo, ...contentParams } = params;
  const content = buildAiInstructions({
    ...contentParams,
    isMonorepo: !!isMonorepo,
  });

  for (const fileChoice of aiFiles) {
    switch (fileChoice) {
      case "cursor-rules":
        files[".cursor/rules"] = { type: "text", content };
        break;
      case "agents-md":
        files["AGENTS.md"] = { type: "text", content };
        break;
      case "claude-md":
        files["CLAUDE.md"] = { type: "text", content };
        break;
      case "copilot-md":
        files[".github/copilot-instructions.md"] = { type: "text", content };
        break;
    }
  }
}

// =============================================================================
// Content Building
// =============================================================================

type AiContentParams = {
  name: string;
  packageManager: string;
  linter: string;
  formatter: string;
  isMonorepo: boolean;
};

type Section = (params: AiContentParams) => string | null;

/**
 * Builds the AI instructions by composing sections.
 * Sections return null to be excluded.
 */
function buildAiInstructions(params: AiContentParams): string {
  const sections: Section[] = [
    // Header (shared, but with different description)
    sectionHeader,
    // Monorepo-specific: package creation rules
    sectionMonorepoPackageCreation,
    // Commands (shared structure, different content)
    sectionCommands,
    // Structure (different for each)
    params.isMonorepo ? sectionMonorepoStructure : sectionStandaloneStructure,
    // Shared: linting & formatting info
    sectionLintingInfo,
  ];

  return sections
    .map((section) => section(params))
    .filter((content): content is string => content !== null)
    .join("\n\n");
}

// =============================================================================
// Shared Sections
// =============================================================================

function sectionHeader(params: AiContentParams): string {
  const { name, isMonorepo } = params;
  const description = isMonorepo
    ? "This is a pnpm monorepo workspace generated with `create-krispya`."
    : "This project was generated with `create-krispya`.";

  return `# ${name}\n\n${description}`;
}

function sectionCommands(params: AiContentParams): string {
  const { packageManager, linter, formatter, isMonorepo } = params;

  if (isMonorepo) {
    return `## Workspace commands

\`\`\`bash
${packageManager} install          # Install all dependencies
${packageManager} run dev          # Run all apps in dev mode
${packageManager} run build        # Build packages then apps
${packageManager} run test         # Run all tests
${packageManager} run lint         # Lint with ${linter}
${packageManager} run format       # Format with ${formatter}
\`\`\``;
  }

  return `## Commands

\`\`\`bash
${packageManager} install          # Install dependencies
${packageManager} run dev          # Start development server
${packageManager} run build        # Build for production
${packageManager} run lint         # Lint with ${linter}
${packageManager} run format       # Format with ${formatter}
\`\`\``;
}

function sectionLintingInfo(params: AiContentParams): string {
  const { linter, formatter } = params;
  return `## Linting & formatting

- Linter: ${linter}
- Formatter: ${formatter}`;
}

// =============================================================================
// Standalone-Only Sections
// =============================================================================

function sectionStandaloneStructure(_params: AiContentParams): string {
  return `## Project structure

- \`src/\`: Source code
- \`public/\`: Static assets (copied to dist)
- \`dist/\`: Build output (gitignored)`;
}

// =============================================================================
// Monorepo-Only Sections
// =============================================================================

function sectionMonorepoPackageCreation(
  params: AiContentParams
): string | null {
  if (!params.isMonorepo) return null;

  const { name, packageManager, linter, formatter } = params;

  return `## Most important rule (package creation)

If you need a new app/package for any reason, **ALWAYS** create it with \`create-krispya\` (do not hand-create folders/package.json).

### Non-interactive (preferred for agents)

\`\`\`bash
${packageManager} create krispya <name> --workspace [options]
\`\`\`

- The package directory will be \`apps/<name>\` (apps) or \`packages/<name>\` (libraries), unless \`--dir\` is provided.
- Package names default to \`@${name}/<name>\` but you can pass any name (scoped or unscoped).

### Workspace maintenance (non-interactive)

\`\`\`bash
${packageManager} create krispya --check                                # validate workspace
${packageManager} create krispya --fix --linter ${linter} --formatter ${formatter}  # fix missing .config packages
${packageManager} create krispya --update --yes                         # update to latest template
${packageManager} create krispya --update --linter eslint --yes         # migrate to different linter
${packageManager} create krispya --update --formatter prettier --yes    # migrate to different formatter
\`\`\`

- \`--fix\` requires \`--linter\` and \`--formatter\` flags for non-interactive mode
- \`--update --yes\` adds new files only, skips modified files
- \`--update --linter/--formatter\` migrates tools, updating all configs and sub-packages

## Package creation options (CLI truth)

| Option | Values | Notes |
|--------|--------|-------|
| \`--type\` | app, library | default: app |
| \`--template\` | vanilla, vanilla-js, react, react-js, r3f, r3f-js | default: vanilla |
| \`--dir\` | any directory | requires \`--workspace\`; default: \`apps/\` or \`packages/\` |
| \`--bundler\` | unbuild, tsdown | libraries only; default: unbuild |

### R3F flags (r3f templates only)

\`--drei\` \`--handle\` \`--leva\` \`--postprocessing\` \`--rapier\` \`--xr\` \`--uikit\` \`--offscreen\` \`--zustand\` \`--koota\` \`--triplex\` \`--viverse\`

### Examples

\`\`\`bash
# React library (@${name}/ui) in packages/ui
${packageManager} create krispya ui --workspace --type library --template react

# R3F app with physics + controls (@${name}/game) in apps/game
${packageManager} create krispya game --workspace --type app --template r3f --drei --rapier --leva

# App in a custom directory
${packageManager} create krispya demo --workspace --type app --template react --dir examples
\`\`\`

## After creating a package

\`\`\`bash
${packageManager} install
\`\`\`

- Use \`"workspace:*"\` for internal deps (e.g. \`"@${name}/ui": "workspace:*"\`).`;
}

function sectionMonorepoStructure(params: AiContentParams): string {
  const { linter, formatter } = params;
  const configDescription = getConfigPackagesDescription(linter, formatter);

  return `## Structure + conventions

- \`apps/\`: applications (\`--type app\`)
- \`packages/\`: libraries (\`--type library\`)
${configDescription}
- TS configs extend \`@config/typescript/*\` (base/app/node/react)`;
}

/**
 * Builds the .config/ description based on linter/formatter choices.
 * Biome uses root biome.json instead of a .config package.
 */
function getConfigPackagesDescription(
  linter: string,
  formatter: string
): string {
  const packages = ["`@config/typescript`"];

  if (linter !== "biome") {
    packages.push(`\`@config/${linter}\``);
  }
  if (formatter !== "biome" && formatter !== linter) {
    packages.push(`\`@config/${formatter}\``);
  }

  let description = `- \`.config/\`: shared config packages (${packages.join(
    ", "
  )})`;

  if (linter === "biome" || formatter === "biome") {
    description += "\n- `biome.json`: Biome configuration (root level)";
  }

  return description;
}
