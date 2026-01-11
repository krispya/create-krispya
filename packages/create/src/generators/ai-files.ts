import type { AiFileChoice } from "../config.js";
import type { File } from "../types.js";

export type AiFilesParams = {
  name: string;
  packageManager: string;
  linter: string;
  formatter: string;
  aiFiles: AiFileChoice[];
};

/**
 * Generates AI instruction files for the monorepo.
 */
export function generateAiFiles(
  files: Record<string, File>,
  params: AiFilesParams
): void {
  const { name, packageManager, linter, formatter, aiFiles } = params;

  const content = getAiInstructionsContent({
    name,
    packageManager,
    linter,
    formatter,
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

type AiContentParams = {
  name: string;
  packageManager: string;
  linter: string;
  formatter: string;
};

/**
 * Returns the AI instructions content for the monorepo.
 */
function getAiInstructionsContent(params: AiContentParams): string {
  const { name, packageManager, linter, formatter } = params;

  return `# ${name}

This is a pnpm monorepo workspace generated with \`create-krispya\`.

## Most important rule (package creation)

If you need a new app/package for any reason, **ALWAYS** create it with \`create-krispya\` (do not hand-create folders/package.json).

### Non-interactive (preferred for agents)

\`\`\`bash
${packageManager} create krispya <name> --workspace [options]
\`\`\`

- The package directory will be \`apps/<name>\` (apps) or \`packages/<name>\` (libraries), unless \`--dir\` is provided.
- The package name will be auto-scoped to \`@${name}/<name>\` unless you pass a scoped name explicitly.

### Useful workspace safety checks

\`\`\`bash
${packageManager} create krispya --check   # validate workspace from current directory
${packageManager} create krispya --fix     # generate missing .config packages if workspace is invalid
\`\`\`

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

# App in a custom directory (still auto-scoped)
${packageManager} create krispya demo --workspace --type app --template react --dir examples
\`\`\`

## After creating a package

\`\`\`bash
${packageManager} install
\`\`\`

- Use \`"workspace:*"\` for internal deps (e.g. \`"@${name}/ui": "workspace:*"\`).

## Workspace commands

\`\`\`bash
${packageManager} install          # Install all dependencies
${packageManager} run dev          # Run all apps in dev mode
${packageManager} run build        # Build packages then apps
${packageManager} run test         # Run all tests
${packageManager} run lint         # Lint with ${linter}
${packageManager} run format       # Format with ${formatter}
\`\`\`

## Structure + conventions

- \`apps/\`: applications (\`--type app\`)
- \`packages/\`: libraries (\`--type library\`)
- \`.config/\`: shared config packages (\`@config/typescript\`, \`@config/${linter}\`, \`@config/${formatter}\`)
- TS configs extend \`@config/typescript/*\` (base/app/node/react)
`;
}
