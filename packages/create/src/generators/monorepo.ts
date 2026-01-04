import { defaultFormatterConfig, defaultLinterConfig } from "../constants.js";
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
 * Generates a monorepo workspace root structure with shared config packages.
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
  const devDependencies: Record<string, string> = {};

  // Add linter to root devDependencies
  if (linter === "oxlint") {
    devDependencies["oxlint"] = "^1.36.0";
  } else if (linter === "eslint") {
    devDependencies["eslint"] = "^9.17.0";
  } else if (linter === "biome") {
    devDependencies["@biomejs/biome"] = "^1.9.4";
  }

  // Add formatter to root devDependencies (if not already added via biome)
  if (formatter === "oxfmt") {
    devDependencies["oxfmt"] = "^0.21.0";
  } else if (formatter === "prettier") {
    devDependencies["prettier"] = "^3.4.2";
  }
  // biome formatter is handled above with linter

  const rootPackageJson: Record<string, unknown> = {
    name: "root",
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "pnpm --filter './apps/*' run dev",
      build: "pnpm --filter './packages/*' run build && pnpm --filter './apps/*' run build",
      test: "pnpm -r run test",
      lint: linter === "oxlint" ? "oxlint ." : linter === "biome" ? "biome check ." : "eslint .",
      format:
        formatter === "oxfmt"
          ? "oxfmt ."
          : formatter === "biome"
            ? "biome format . --write"
            : "prettier --write .",
    },
    devDependencies,
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

  // pnpm-workspace.yaml - includes .config/* for config packages
  if (isPnpm) {
    const workspaceLines: string[] = [];

    if (pnpmManageVersions) {
      workspaceLines.push("manage-package-manager-versions: true", "");
    }

    workspaceLines.push(
      "packages:",
      '  - ".config/*"',
      '  - "apps/*"',
      '  - "packages/*"',
      "",
    );
    workspaceLines.push("onlyBuiltDependencies:", "  - esbuild");

    files["pnpm-workspace.yaml"] = {
      type: "text",
      content: workspaceLines.join("\n"),
    };
  }

  // Generate @config/typescript package
  generateTypescriptConfigPackage(files);

  // Generate @config/oxlint package (when oxlint is selected)
  if (linter === "oxlint") {
    generateOxlintConfigPackage(files);
  } else if (linter === "eslint") {
    // ESLint config at root (flat config doesn't extend well as a package)
    files["eslint.config.js"] = {
      type: "text",
      content: `export default [\n  // Add your ESLint rules here\n];\n`,
    };
  } else if (linter === "biome") {
    // Biome config at root (handles both linting and formatting when selected)
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

  // Generate @config/oxfmt package (when oxfmt is selected)
  if (formatter === "oxfmt") {
    generateOxfmtConfigPackage(files);
  } else if (formatter === "prettier") {
    // Prettier config at root
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
  }
  // biome formatter is handled above with linter

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

  // VS Code settings
  generateVscodeFiles(files, linter, formatter);

  // README
  files["README.md"] = {
    type: "text",
    content: `# ${name}

This monorepo workspace was generated with create-krispya.

## Structure

- \`apps/\` - Applications
- \`packages/\` - Shared packages and libraries
- \`.config/\` - Shared configuration packages

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

/**
 * Generates @config/typescript package with base, app, node, and react configs.
 */
function generateTypescriptConfigPackage(files: Record<string, File>): void {
  const basePath = ".config/typescript";

  // package.json
  files[`${basePath}/package.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        name: "@config/typescript",
        version: "0.1.0",
        private: true,
        files: ["base.json", "app.json", "node.json", "react.json"],
      },
      null,
      2,
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: "text",
    content: `# \`@config/typescript\`

These are base shared \`tsconfig.json\`s from which all other \`tsconfig.json\`s inherit.

## Usage

In your package's \`tsconfig.json\`:

\`\`\`json
{
  "extends": "@config/typescript/app.json",
  "include": ["src/**/*", "tests"]
}
\`\`\`

## Available Configs

- \`base.json\` - Common TypeScript compiler options
- \`app.json\` - For browser/DOM code (extends base)
- \`node.json\` - For Node.js code (extends base)
- \`react.json\` - For React projects with JSX (extends app)
`,
  };

  // base.json - Common compiler options
  files[`${basePath}/base.json`] = {
    type: "text",
    content: JSON.stringify(
      {
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
      },
      null,
      2,
    ),
  };

  // app.json - Browser/DOM environment
  files[`${basePath}/app.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        $schema: "https://json.schemastore.org/tsconfig",
        extends: "./base.json",
        compilerOptions: {
          lib: ["DOM", "DOM.Iterable", "ESNext"],
        },
      },
      null,
      2,
    ),
  };

  // node.json - Node.js environment
  files[`${basePath}/node.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        $schema: "https://json.schemastore.org/tsconfig",
        extends: "./base.json",
        compilerOptions: {
          lib: ["ESNext"],
        },
      },
      null,
      2,
    ),
  };

  // react.json - React with JSX
  files[`${basePath}/react.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        $schema: "https://json.schemastore.org/tsconfig",
        extends: "./app.json",
        compilerOptions: {
          jsx: "react-jsx",
        },
      },
      null,
      2,
    ),
  };
}

/**
 * Generates @config/oxlint package with base and react configs.
 */
function generateOxlintConfigPackage(files: Record<string, File>): void {
  const basePath = ".config/oxlint";
  const { rules } = defaultLinterConfig;

  // package.json
  files[`${basePath}/package.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        name: "@config/oxlint",
        version: "0.1.0",
        private: true,
        files: ["base.json", "react.json"],
      },
      null,
      2,
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: "text",
    content: `# \`@config/oxlint\`

Shared oxlint configurations for the monorepo.

## Usage

Run oxlint with a config:

\`\`\`bash
oxlint -c node_modules/@config/oxlint/base.json
\`\`\`

## Available Configs

- \`base.json\` - Base linting rules for TypeScript projects
- \`react.json\` - Extends base with React-specific rules
`,
  };

  // base.json - Base oxlint config
  files[`${basePath}/base.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        $schema: "./node_modules/oxlint/configuration_schema.json",
        plugins: ["unicorn", "typescript", "oxc"],
        rules: {
          "no-unused-vars": [
            rules.noUnusedVars.level,
            {
              argsIgnorePattern: rules.noUnusedVars.argsIgnorePattern,
              varsIgnorePattern: rules.noUnusedVars.varsIgnorePattern,
              caughtErrorsIgnorePattern: rules.noUnusedVars.caughtErrorsIgnorePattern,
            },
          ],
          "no-useless-escape": "off",
          "no-unused-expressions": [
            rules.noUnusedExpressions.level,
            { allowShortCircuit: rules.noUnusedExpressions.allowShortCircuit },
          ],
        },
        ignorePatterns: defaultLinterConfig.ignorePatterns,
      },
      null,
      2,
    ),
  };

  // react.json - React-specific oxlint config
  files[`${basePath}/react.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        $schema: "./node_modules/oxlint/configuration_schema.json",
        plugins: ["unicorn", "typescript", "oxc", "react"],
        rules: {
          "no-unused-vars": [
            rules.noUnusedVars.level,
            {
              argsIgnorePattern: rules.noUnusedVars.argsIgnorePattern,
              varsIgnorePattern: rules.noUnusedVars.varsIgnorePattern,
              caughtErrorsIgnorePattern: rules.noUnusedVars.caughtErrorsIgnorePattern,
            },
          ],
          "no-useless-escape": "off",
          "no-unused-expressions": [
            rules.noUnusedExpressions.level,
            { allowShortCircuit: rules.noUnusedExpressions.allowShortCircuit },
          ],
        },
        ignorePatterns: defaultLinterConfig.ignorePatterns,
      },
      null,
      2,
    ),
  };
}

/**
 * Generates VS Code configuration files for the monorepo root.
 */
function generateVscodeFiles(
  files: Record<string, File>,
  linter: Linter,
  formatter: Formatter,
): void {
  const recommendations: string[] = [];
  const settings: Record<string, unknown> = {};

  // Linter settings
  if (linter === "oxlint") {
    recommendations.push("oxc.oxc-vscode");
    settings["oxc.enable"] = true;
    settings["eslint.enable"] = false;
    settings["biome.enabled"] = false;
  } else if (linter === "eslint") {
    recommendations.push("dbaeumer.vscode-eslint");
    settings["eslint.enable"] = true;
    settings["oxc.enable"] = false;
    settings["biome.enabled"] = false;
  } else if (linter === "biome") {
    recommendations.push("biomejs.biome");
    settings["biome.enabled"] = true;
    settings["eslint.enable"] = false;
    settings["oxc.enable"] = false;
  }

  // Formatter settings
  if (formatter === "oxfmt") {
    if (!recommendations.includes("oxc.oxc-vscode")) {
      recommendations.push("oxc.oxc-vscode");
    }
    settings["editor.defaultFormatter"] = "oxc.oxc-vscode";
    settings["[json]"] = { "editor.defaultFormatter": "vscode.json-language-features" };
    settings["[jsonc]"] = { "editor.defaultFormatter": "vscode.json-language-features" };
  } else if (formatter === "prettier") {
    recommendations.push("esbenp.prettier-vscode");
    settings["editor.defaultFormatter"] = "esbenp.prettier-vscode";
  } else if (formatter === "biome") {
    if (!recommendations.includes("biomejs.biome")) {
      recommendations.push("biomejs.biome");
    }
    settings["editor.defaultFormatter"] = "biomejs.biome";
  }

  // extensions.json
  files[".vscode/extensions.json"] = {
    type: "text",
    content: JSON.stringify({ recommendations }, null, 2),
  };

  // settings.json
  files[".vscode/settings.json"] = {
    type: "text",
    content: JSON.stringify(settings, null, "\t"),
  };
}

/**
 * Generates @config/oxfmt package with base config.
 */
function generateOxfmtConfigPackage(files: Record<string, File>): void {
  const basePath = ".config/oxfmt";

  // package.json
  files[`${basePath}/package.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        name: "@config/oxfmt",
        version: "0.1.0",
        private: true,
        files: ["base.json"],
      },
      null,
      2,
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: "text",
    content: `# \`@config/oxfmt\`

Shared oxfmt (formatter) configuration for the monorepo.

## Usage

Run oxfmt with the config:

\`\`\`bash
oxfmt -c node_modules/@config/oxfmt/base.json --write .
\`\`\`

## Available Configs

- \`base.json\` - Base formatter settings (Prettier-compatible)
`,
  };

  // base.json - Base oxfmt config
  files[`${basePath}/base.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        printWidth: defaultFormatterConfig.printWidth,
        tabWidth: defaultFormatterConfig.tabWidth,
        useTabs: defaultFormatterConfig.useTabs,
        semi: defaultFormatterConfig.semi,
        singleQuote: defaultFormatterConfig.singleQuote,
        trailingComma: defaultFormatterConfig.trailingComma,
        bracketSpacing: defaultFormatterConfig.bracketSpacing,
        arrowParens: defaultFormatterConfig.arrowParens,
      },
      null,
      2,
    ),
  };
}
