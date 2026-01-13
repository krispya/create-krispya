import type { AiFileChoice } from "../config.js";
import type { File, Linter, Formatter } from "../types.js";
import { generateAiFiles } from "./ai-files.js";
import {
  generateTypescriptConfigPackage,
  generateOxlintConfigPackage,
  generateEslintConfigPackage,
  generatePrettierConfigPackage,
  generateOxfmtConfigPackage,
} from "./config-packages.js";

/**
 * Parameters for generating a monorepo workspace.
 *
 * Note: Monorepos are currently pnpm-only. We use pnpm workspaces for
 * dependency management and the .config/* pattern for shared configs.
 *
 * TODO: Support yarn and npm workspaces in the future.
 */
export type MonorepoParams = {
  name: string;
  linter: Linter;
  formatter: Formatter;
  /** Currently always "pnpm" - monorepos are pnpm-only */
  packageManager: string;
  pnpmVersion?: string;
  pnpmManageVersions?: boolean;
  nodeVersion?: string;
  aiFiles?: AiFileChoice[];
};

export type MonorepoResult = {
  files: Record<string, File>;
};

/**
 * Generates a monorepo workspace root structure with shared config packages.
 *
 * Note: Monorepos are currently pnpm-only. Detection relies on pnpm-workspace.yaml.
 * TODO: Support yarn and npm workspaces in the future.
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
    aiFiles,
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
      build:
        "pnpm --filter './packages/*' run build && pnpm --filter './apps/*' run build",
      test: "pnpm -r run test",
      lint:
        linter === "oxlint"
          ? "oxlint ."
          : linter === "biome"
          ? "biome check ."
          : "eslint .",
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
      ""
    );
    workspaceLines.push("onlyBuiltDependencies:", "  - esbuild");

    files["pnpm-workspace.yaml"] = {
      type: "text",
      content: workspaceLines.join("\n"),
    };
  }

  // Generate @config/typescript package
  generateTypescriptConfigPackage(files);

  // Generate linter config package
  if (linter === "oxlint") {
    generateOxlintConfigPackage(files);
  } else if (linter === "eslint") {
    generateEslintConfigPackage(files);
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

  // Generate formatter config package
  if (formatter === "oxfmt") {
    generateOxfmtConfigPackage(files);
  } else if (formatter === "prettier") {
    generatePrettierConfigPackage(files);
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

  // Generate AI instruction files
  if (aiFiles && aiFiles.length > 0) {
    generateAiFiles(files, {
      name,
      packageManager,
      linter,
      formatter,
      aiFiles,
      isMonorepo: true,
    });
  }

  return { files };
}

/**
 * Generates VS Code configuration files for the monorepo root.
 */
export function generateVscodeFiles(
  files: Record<string, File>,
  linter: Linter,
  formatter: Formatter
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
    settings["[json]"] = {
      "editor.defaultFormatter": "vscode.json-language-features",
    };
    settings["[jsonc]"] = {
      "editor.defaultFormatter": "vscode.json-language-features",
    };
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

// Re-export for cli.ts which imports these directly
export {
  generateTypescriptConfigPackage,
  generateOxlintConfigPackage,
  generateEslintConfigPackage,
  generatePrettierConfigPackage,
  generateOxfmtConfigPackage,
} from "./config-packages.js";
