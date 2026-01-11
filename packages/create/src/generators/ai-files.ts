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

## Adding Packages

\`\`\`bash
${packageManager} create krispya <name> --workspace [options]
\`\`\`

### Options

| Option | Values | Default |
|--------|--------|---------|
| \`--type\` | app, library | app |
| \`--template\` | vanilla, react, r3f | vanilla |
| \`--dir\` | any directory | apps/ or packages/ |
| \`--bundler\` | unbuild, tsdown | unbuild |

### R3F Integrations

\`--drei\` \`--leva\` \`--rapier\` \`--zustand\` \`--koota\` \`--xr\` \`--uikit\` \`--postprocessing\`

### Examples

\`\`\`bash
# React library
${packageManager} create krispya ui --workspace --type library --template react

# R3F app with physics and controls
${packageManager} create krispya game --workspace --template r3f --drei --rapier --leva

# Example in custom directory
${packageManager} create krispya demo --workspace --dir examples --template react
\`\`\`

## Workspace Commands

\`\`\`bash
${packageManager} install          # Install all dependencies
${packageManager} run dev          # Run all apps in dev mode  
${packageManager} run build        # Build packages then apps
${packageManager} run test         # Run all tests
${packageManager} run lint         # Lint with ${linter}
${packageManager} run format       # Format with ${formatter}
\`\`\`

## Structure

- \`apps/\` - Application packages (--type app, default)
- \`packages/\` - Library packages (--type library)
- \`.config/\` - Shared configs (\`@config/typescript\`, \`@config/${linter}\`, \`@config/${formatter}\`)

## Conventions

- Package names are scoped: \`@${name}/<package-name>\`
- TypeScript extends \`@config/typescript/base.json\`, \`app.json\`, \`node.json\`, or \`react.json\`
- Use \`workspace:*\` protocol for internal dependencies
`;
}
