import type { File, Linter, Formatter } from "../types.js";

export type MonorepoParams = {
  name: string;
  linter: Linter;
  formatter: Formatter;
  packageManager: string;
  pnpmVersion?: string;
  pnpmManageVersions?: boolean;
  nodeVersion?: string;
};

export type MonorepoResult = {
  files: Record<string, File>;
};

/**
 * Generates a monorepo workspace root structure with shared configs.
 */
export function generateMonorepo(params: MonorepoParams): MonorepoResult {
  const {
    name,
    linter,
    formatter,
    packageManager,
    pnpmVersion,
    pnpmManageVersions,
    nodeVersion,
  } = params;

  const files: Record<string, File> = {};
  const isPnpm = packageManager === "pnpm";

  // Root package.json (private workspace root)
  const rootPackageJson: Record<string, unknown> = {
    name: "root",
    version: "0.0.0",
    private: true,
    description: "Monorepo workspace built with 🌹 create-krispya",
    type: "module",
    scripts: {
      dev: "pnpm --filter './apps/*' run dev",
      build: "pnpm --filter './packages/*' run build && pnpm --filter './apps/*' run build",
      test: "vitest",
      lint: linter === "oxlint" ? "oxlint ." : linter === "biome" ? "biome check ." : "eslint .",
      format:
        formatter === "oxfmt"
          ? "oxfmt ."
          : formatter === "biome"
            ? "biome format . --write"
            : "prettier --write .",
    },
  };

  // Add engines field if needed
  const engines: Record<string, string> = {};

  if (isPnpm && pnpmVersion) {
    const majorVersion = pnpmVersion.split(".")[0];
    engines.pnpm = `>=${majorVersion}.0.0`;
    rootPackageJson.packageManager = `pnpm@${pnpmVersion}`;
  }

  if (nodeVersion) {
    const majorVersion = nodeVersion.split(".")[0];
    engines.node = `>=${majorVersion}.0.0`;
  }

  if (Object.keys(engines).length > 0) {
    rootPackageJson.engines = engines;
  }

  files["package.json"] = {
    type: "text",
    content: JSON.stringify(rootPackageJson, null, 2),
  };

  // pnpm-workspace.yaml
  if (isPnpm) {
    const workspaceLines: string[] = [];

    if (pnpmManageVersions) {
      workspaceLines.push("manage-package-manager-versions: true", "");
    }

    workspaceLines.push("packages:", '  - "apps/*"', '  - "packages/*"', "");
    workspaceLines.push("onlyBuiltDependencies:", "  - esbuild");

    files["pnpm-workspace.yaml"] = {
      type: "text",
      content: workspaceLines.join("\n"),
    };
  }

  // Shared TypeScript configs in .config/
  // Base config with common compiler options
  const tsConfigBase = {
    $schema: "https://json.schemastore.org/tsconfig",
    compilerOptions: {
      target: "ESNext",
      module: "ESNext",
      moduleResolution: "bundler",
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      strict: true,
      skipLibCheck: true,
      composite: true,
      rewriteRelativeImportExtensions: true,
      erasableSyntaxOnly: true,
    },
  };

  files[".config/tsconfig.base.json"] = {
    type: "text",
    content: JSON.stringify(tsConfigBase, null, 2),
  };

  // App config for browser environments
  const tsConfigApp = {
    $schema: "https://json.schemastore.org/tsconfig",
    extends: "./tsconfig.base.json",
    compilerOptions: {
      lib: ["DOM", "DOM.Iterable", "ESNext"],
    },
  };

  files[".config/tsconfig.app.json"] = {
    type: "text",
    content: JSON.stringify(tsConfigApp, null, 2),
  };

  // Node config for Node.js environments
  const tsConfigNode = {
    $schema: "https://json.schemastore.org/tsconfig",
    extends: "./tsconfig.base.json",
    compilerOptions: {
      lib: ["ESNext"],
    },
  };

  files[".config/tsconfig.node.json"] = {
    type: "text",
    content: JSON.stringify(tsConfigNode, null, 2),
  };

  // Root tsconfig.json solution file
  const tsConfigRoot = {
    $schema: "https://json.schemastore.org/tsconfig",
    files: [],
    references: [] as Array<{ path: string }>,
  };

  files["tsconfig.json"] = {
    type: "text",
    content: JSON.stringify(tsConfigRoot, null, 2),
  };

  // Linter config
  if (linter === "oxlint") {
    const oxlintConfig = {
      rules: {},
    };
    files["oxlint.json"] = {
      type: "text",
      content: JSON.stringify(oxlintConfig, null, 2),
    };
  } else if (linter === "eslint") {
    files["eslint.config.js"] = {
      type: "text",
      content: `export default [\n  // Add your ESLint rules here\n];\n`,
    };
  } else if (linter === "biome") {
    const biomeConfig = {
      $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
      vcs: {
        enabled: true,
        clientKind: "git",
        useIgnoreFile: true,
      },
      linter: {
        enabled: true,
        rules: {
          recommended: true,
        },
      },
      formatter: {
        enabled: formatter === "biome",
      },
    };
    files["biome.json"] = {
      type: "text",
      content: JSON.stringify(biomeConfig, null, 2),
    };
  }

  // Formatter config (if not biome which is handled above)
  if (formatter === "prettier") {
    const prettierConfig = {
      semi: true,
      singleQuote: false,
      trailingComma: "es5",
      printWidth: 100,
    };
    files[".prettierrc.json"] = {
      type: "text",
      content: JSON.stringify(prettierConfig, null, 2),
    };
  } else if (formatter === "oxfmt") {
    const oxfmtConfig = {};
    files[".oxfmtrc.json"] = {
      type: "text",
      content: JSON.stringify(oxfmtConfig, null, 2),
    };
  }

  // Vitest workspace config
  files["vitest.workspace.ts"] = {
    type: "text",
    content: `import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/*/vitest.config.ts",
  "packages/*/vitest.config.ts",
]);
`,
  };

  // .gitignore
  files[".gitignore"] = {
    type: "text",
    content: ["node_modules", "dist", "*.tsbuildinfo", ".DS_Store"].join("\n"),
  };

  // .gitattributes
  files[".gitattributes"] = {
    type: "text",
    content: `* text=auto eol=lf
*.{cmd,[cC][mM][dD]} text eol=crlf
*.{bat,[bB][aA][tT]} text eol=crlf
`,
  };

  // Create empty directories with .gitkeep
  files["apps/.gitkeep"] = {
    type: "text",
    content: "",
  };

  files["packages/.gitkeep"] = {
    type: "text",
    content: "",
  };

  // README
  files["README.md"] = {
    type: "text",
    content: `# ${name}

This monorepo workspace was generated with create-krispya.

## Structure

- \`apps/\` - Applications
- \`packages/\` - Shared packages and libraries
- \`.config/\` - Shared TypeScript configurations

## Development Commands

- \`${packageManager} install\` to install all dependencies
- \`${packageManager} run dev\` to run all applications in development mode
- \`${packageManager} run build\` to build all packages and applications
- \`${packageManager} run test\` to run tests across the workspace
- \`${packageManager} run lint\` to lint all code
- \`${packageManager} run format\` to format all code

## Adding Packages

To add a new package to this workspace, run create-krispya from this directory and it will detect the monorepo.
`,
  };

  return { files };
}

