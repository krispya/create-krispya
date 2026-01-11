#!/usr/bin/env node
import { createRequire } from "module";
import { cwd } from "process";
import { dirname, join, resolve } from "path";
import { mkdir, writeFile, readFile, access, unlink } from "fs/promises";
import { constants } from "fs";
import { Command } from "commander";
import * as p from "@clack/prompts";
import color from "chalk";
import { fetch } from "undici";

import {
  editorNames,
  getDefaultProjectName,
  openInEditor,
  promptForOptions,
  promptForPackageOptions,
  promptForInitialPackage,
} from "./cli/index.js";
import {
  clearConfig,
  EditorChoice,
  getConfigPath,
  getPreferredEditor,
  getReuseWindow,
  setPreferredEditor,
  setReuseWindow,
  getAiFiles,
  setAiFiles,
  type AiFileChoice,
} from "./config.js";
import {
  generate,
  getBaseTemplate,
  getLatestNodeVersion,
  getLatestNpmCliVersion,
  getLatestNpmVersion,
  getLatestPnpmVersion,
  getLatestYarnVersion,
  parseWorkspaceYamlContent,
  validatePackageName,
  type GenerateOptions,
  type LibraryBundler,
  type PackageVersions,
  type ProjectType,
  type Template,
} from "./index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

interface CliOptions {
  type?: ProjectType;
  bundler?: LibraryBundler;
  template?: Template;
  linter?: "eslint" | "oxlint" | "biome";
  formatter?: "prettier" | "oxfmt" | "biome";
  drei?: boolean;
  handle?: boolean;
  leva?: boolean;
  postprocessing?: boolean;
  rapier?: boolean;
  xr?: boolean;
  uikit?: boolean;
  offscreen?: boolean;
  zustand?: boolean;
  koota?: boolean;
  pnpmManageVersions?: boolean;
  triplex?: boolean;
  viverse?: boolean;
  packageManager?: string;
  nodeVersion?: string;
  clearConfig?: boolean;
  dir?: string;
  configPath?: boolean;
  check?: boolean;
  fix?: boolean;
  workspace?: boolean;
}

/**
 * Detects if the current directory is inside a monorepo workspace.
 * Looks for pnpm-workspace.yaml with packages array in current or parent directories.
 */
async function detectMonorepoRoot(): Promise<string | null> {
  let currentDir = cwd();
  const root = resolve("/");

  while (currentDir !== root) {
    const workspaceFile = join(currentDir, "pnpm-workspace.yaml");
    try {
      await access(workspaceFile, constants.F_OK);
      const content = await readFile(workspaceFile, "utf-8");
      // Check if it has packages field (indicating it's a monorepo workspace)
      if (content.includes("packages:")) {
        return currentDir;
      }
    } catch {
      // File doesn't exist, continue
    }
    currentDir = dirname(currentDir);
  }

  return null;
}

/**
 * Parses pnpm-workspace.yaml to extract workspace directories.
 */
async function parseWorkspaceDirectories(
  monorepoRoot: string
): Promise<string[]> {
  try {
    const workspaceFile = join(monorepoRoot, "pnpm-workspace.yaml");
    const content = await readFile(workspaceFile, "utf-8");
    return parseWorkspaceYamlContent(content);
  } catch {
    return [];
  }
}

import { validateWorkspace } from "./validate.js";
import {
  generateTypescriptConfigPackage,
  generateOxlintConfigPackage,
  generateEslintConfigPackage,
  generateOxfmtConfigPackage,
  generatePrettierConfigPackage,
  generateVscodeFiles,
} from "./generators/monorepo.js";
import { generateAiFiles } from "./generators/ai-files.js";

type WorkspaceTooling = {
  linter?: "oxlint" | "eslint" | "biome";
  formatter?: "oxfmt" | "prettier" | "biome";
};

/**
 * Detects linter and formatter from the monorepo root package.json.
 */
async function detectWorkspaceTooling(
  monorepoRoot: string
): Promise<WorkspaceTooling> {
  try {
    const pkgPath = join(monorepoRoot, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content) as {
      devDependencies?: Record<string, string>;
    };
    const devDeps = pkg.devDependencies ?? {};

    const linter = devDeps.oxlint
      ? "oxlint"
      : devDeps.eslint
      ? "eslint"
      : devDeps["@biomejs/biome"]
      ? "biome"
      : undefined;

    const formatter = devDeps.oxfmt
      ? "oxfmt"
      : devDeps.prettier
      ? "prettier"
      : devDeps["@biomejs/biome"]
      ? "biome"
      : undefined;

    return { linter, formatter };
  } catch {
    return {};
  }
}

/**
 * Helper to check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

interface ExistingConfigs {
  linter?: "eslint" | "biome";
  formatter?: "prettier" | "biome";
  eslintConfigPath?: string;
  prettierConfigPath?: string;
  biomeConfigPath?: string;
}

/**
 * Detects existing root config files that may need migration.
 */
async function detectExistingConfigs(
  monorepoRoot: string
): Promise<ExistingConfigs> {
  const configs: ExistingConfigs = {};

  // Check for eslint config
  const eslintPath = join(monorepoRoot, "eslint.config.js");
  if (await fileExists(eslintPath)) {
    configs.linter = "eslint";
    configs.eslintConfigPath = eslintPath;
  }

  // Check for prettier config
  const prettierPath = join(monorepoRoot, ".prettierrc.json");
  if (await fileExists(prettierPath)) {
    configs.formatter = "prettier";
    configs.prettierConfigPath = prettierPath;
  }

  // Check for biome config
  const biomePath = join(monorepoRoot, "biome.json");
  if (await fileExists(biomePath)) {
    configs.biomeConfigPath = biomePath;
    // Biome can be both linter and formatter
    if (!configs.linter) configs.linter = "biome";
    if (!configs.formatter) configs.formatter = "biome";
  }

  return configs;
}

/**
 * Migrates an existing eslint.config.js to .config/eslint package.
 */
async function migrateEslintConfig(
  monorepoRoot: string,
  files: Record<string, { type: "text"; content: string }>
): Promise<void> {
  const basePath = ".config/eslint";
  const existingConfigPath = join(monorepoRoot, "eslint.config.js");

  // Read existing config
  let existingContent: string;
  try {
    existingContent = await readFile(existingConfigPath, "utf-8");
  } catch {
    // If we can't read it, generate a fresh one
    generateEslintConfigPackage(files);
    return;
  }

  // package.json
  files[`${basePath}/package.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        name: "@config/eslint",
        version: "0.1.0",
        private: true,
        type: "module",
        exports: {
          "./base": "./base.js",
          "./react": "./react.js",
        },
      },
      null,
      2
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: "text",
    content: `# \`@config/eslint\`

Shared ESLint configurations.

## Usage

In your package's \`eslint.config.js\`:

\`\`\`js
import base from "@config/eslint/base";

export default [...base];
\`\`\`

## Available Configs

- \`base\` - Base ESLint rules (migrated from root)
- \`react\` - React-specific rules
`,
  };

  // Migrate existing config as base.js
  files[`${basePath}/base.js`] = {
    type: "text",
    content: existingContent,
  };

  // Add a react.js config
  files[`${basePath}/react.js`] = {
    type: "text",
    content: `import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];
`,
  };
}

/**
 * Migrates an existing .prettierrc.json to .config/prettier package.
 */
async function migratePrettierConfig(
  monorepoRoot: string,
  files: Record<string, { type: "text"; content: string }>
): Promise<void> {
  const basePath = ".config/prettier";
  const existingConfigPath = join(monorepoRoot, ".prettierrc.json");

  // Read existing config
  let existingContent: string;
  try {
    existingContent = await readFile(existingConfigPath, "utf-8");
  } catch {
    // If we can't read it, generate a fresh one
    generatePrettierConfigPackage(files);
    return;
  }

  // package.json
  files[`${basePath}/package.json`] = {
    type: "text",
    content: JSON.stringify(
      {
        name: "@config/prettier",
        version: "0.1.0",
        private: true,
        exports: {
          "./base": "./base.json",
        },
      },
      null,
      2
    ),
  };

  // README.md
  files[`${basePath}/README.md`] = {
    type: "text",
    content: `# \`@config/prettier\`

Shared Prettier configurations.

## Usage

In your package's \`.prettierrc\`:

\`\`\`json
"@config/prettier/base"
\`\`\`

Or in \`package.json\`:

\`\`\`json
{
  "prettier": "@config/prettier/base"
}
\`\`\`

## Available Configs

- \`base\` - Base Prettier rules (migrated from root)
`,
  };

  // Migrate existing config as base.json
  files[`${basePath}/base.json`] = {
    type: "text",
    content: existingContent,
  };
}

/**
 * Ensures .config/* is in pnpm-workspace.yaml packages array.
 */
async function ensureConfigInWorkspace(monorepoRoot: string): Promise<void> {
  const workspacePath = join(monorepoRoot, "pnpm-workspace.yaml");

  let content: string;
  try {
    content = await readFile(workspacePath, "utf-8");
  } catch {
    // Create new workspace file if it doesn't exist
    content = `packages:
  - ".config/*"
  - "packages/*"
`;
    await writeFile(workspacePath, content);
    return;
  }

  // Check if .config/* is already present
  if (content.includes(".config/*") || content.includes('".config/*"')) {
    return;
  }

  // Add .config/* to packages
  const lines = content.split("\n");
  const packagesIndex = lines.findIndex((line) =>
    line.trim().startsWith("packages:")
  );

  if (packagesIndex === -1) {
    // No packages section, add one
    content = `packages:
  - ".config/*"
${content}`;
  } else {
    // Insert .config/* after packages:
    lines.splice(packagesIndex + 1, 0, '  - ".config/*"');
    content = lines.join("\n");
  }

  await writeFile(workspacePath, content);
}

/**
 * Gets the monorepo scope name from root package.json name field or directory name.
 */
async function getMonorepoScope(monorepoRoot: string): Promise<string> {
  try {
    const pkgPath = join(monorepoRoot, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content) as { name?: string };
    // Use package.json name if it exists, otherwise use directory name
    if (pkg.name) {
      // Strip any existing @ prefix and /root suffix
      return pkg.name.replace(/^@/, "").replace(/\/.*$/, "");
    }
  } catch {
    // Fall through to directory name
  }
  // Use the directory name as fallback
  return monorepoRoot.split(/[/\\]/).pop() ?? "workspace";
}

type WorkspacePackage = {
  name: string;
  path: string;
};

/**
 * Scans the packages/ directory for existing workspace packages.
 */
async function getWorkspacePackages(
  monorepoRoot: string
): Promise<WorkspacePackage[]> {
  const packagesDir = join(monorepoRoot, "packages");
  const packages: WorkspacePackage[] = [];

  try {
    const { readdir } = await import("fs/promises");
    const entries = await readdir(packagesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const pkgJsonPath = join(packagesDir, entry.name, "package.json");
          const content = await readFile(pkgJsonPath, "utf-8");
          const pkg = JSON.parse(content) as { name?: string };
          if (pkg.name) {
            packages.push({ name: pkg.name, path: `packages/${entry.name}` });
          }
        } catch {
          // No package.json or invalid, skip
        }
      }
    }
  } catch {
    // packages/ doesn't exist yet
  }

  return packages;
}

/**
 * Creates a single package in a monorepo workspace.
 * Returns true if another package should be added, false otherwise.
 */
async function createPackageInWorkspace(
  monorepoRoot: string,
  packageManager: string,
  inheritedTooling: WorkspaceTooling,
  scope: string
): Promise<boolean> {
  // Parse workspace directories to check for custom directories
  const workspaceDirectories = await parseWorkspaceDirectories(monorepoRoot);
  const defaultDirectories = ["apps", "packages"];
  const hasCustomDirectories =
    workspaceDirectories.length > 0 &&
    !workspaceDirectories.every((dir) => defaultDirectories.includes(dir));

  // Prompt for package type
  const packageType = await promptForInitialPackage();

  if (packageType === "skip") {
    return false;
  }

  // Default directory based on package type
  const defaultDir = packageType === "app" ? "apps" : "packages";

  // Prompt for package name (without scope - we'll add it)
  // Directory validation happens after directory selection
  const packageNameInput = await p.text({
    message: "Package name?",
    placeholder: `Scoped to @${scope}/`,
    validate: (value) => {
      // Validate package name format
      const validationError = validatePackageName(value);
      if (validationError) return validationError;

      // Check if directory already exists in the default directory
      // (Full validation after directory selection if custom directories exist)
      if (!hasCustomDirectories) {
        const targetPath = join(monorepoRoot, defaultDir, value);
        try {
          const { statSync } = require("fs");
          statSync(targetPath);
          return `Directory ${defaultDir}/${value} already exists`;
        } catch {
          // Directory doesn't exist, which is what we want
        }
      }
    },
  });

  if (p.isCancel(packageNameInput)) {
    return false;
  }

  // Build scoped package name
  const shortName = packageNameInput as string;
  const scopedName = `@${scope}/${shortName}`;

  // Continue with package prompt flow (with inherited tooling)
  const packageOptions = await promptForPackageOptions(
    scopedName,
    packageType,
    inheritedTooling
  );

  // Determine target directory - prompt if custom directories exist
  let targetDir = defaultDir;
  if (hasCustomDirectories && workspaceDirectories.length > 0) {
    const dirChoice = await p.select({
      message: "Target directory",
      options: workspaceDirectories.map((dir) => ({
        value: dir,
        label: dir,
      })),
      initialValue: workspaceDirectories.includes(defaultDir)
        ? defaultDir
        : workspaceDirectories[0],
    });

    if (p.isCancel(dirChoice)) {
      return false;
    }
    targetDir = dirChoice as string;

    // Validate that directory doesn't already exist for selected target
    const targetPath = join(monorepoRoot, targetDir, shortName);
    try {
      const { statSync } = require("fs");
      statSync(targetPath);
      p.log.error(`Directory ${targetDir}/${shortName} already exists`);
      return false;
    } catch {
      // Directory doesn't exist, which is what we want
    }
  }

  const packagePath = join(targetDir, shortName);
  const workspaceRoot = "../..";

  packageOptions.workspaceRoot = workspaceRoot;
  packageOptions.name = scopedName;

  // Fetch package manager versions
  if (packageManager === "pnpm") {
    packageOptions.pnpmVersion = await getLatestPnpmVersion();
  } else if (packageManager === "yarn") {
    packageOptions.yarnVersion = await getLatestYarnVersion();
  } else if (packageManager === "npm") {
    packageOptions.npmVersion = await getLatestNpmCliVersion();
  }

  const nodeVersion = packageOptions.nodeVersion ?? "latest";
  if (nodeVersion === "latest") {
    packageOptions.nodeVersion = await getLatestNodeVersion();
  }

  // Fetch package versions
  const versions: PackageVersions = {};
  const versionPromises: Promise<void>[] = [];

  const pkgIsLibrary = packageOptions.projectType === "library";
  const pkgTesting =
    packageOptions.testing ?? (pkgIsLibrary ? "vitest" : "none");
  if (pkgTesting === "vitest") {
    versionPromises.push(
      getLatestNpmVersion("vitest", "4.0.0").then((v) => {
        versions.vitest = v;
      })
    );
  }

  if (!pkgIsLibrary) {
    versionPromises.push(
      getLatestNpmVersion("vite", "6.3.4").then((v) => {
        versions.vite = v;
      })
    );
  }

  const linter = packageOptions.linter ?? "oxlint";
  if (linter === "eslint") {
    versionPromises.push(
      getLatestNpmVersion("eslint", "9.17.0").then((v) => {
        versions.eslint = v;
      })
    );
  } else if (linter === "oxlint") {
    versionPromises.push(
      getLatestNpmVersion("oxlint", "0.16.0").then((v) => {
        versions.oxlint = v;
      })
    );
  } else if (linter === "biome") {
    versionPromises.push(
      getLatestNpmVersion("@biomejs/biome", "1.9.4").then((v) => {
        versions.biome = v;
      })
    );
  }

  const formatter = packageOptions.formatter ?? "oxfmt";
  if (formatter === "prettier") {
    versionPromises.push(
      getLatestNpmVersion("prettier", "3.4.2").then((v) => {
        versions.prettier = v;
      })
    );
  } else if (formatter === "oxfmt") {
    versionPromises.push(
      getLatestNpmVersion("oxfmt", "0.1.0").then((v) => {
        versions.oxfmt = v;
      })
    );
  } else if (formatter === "biome" && linter !== "biome") {
    versionPromises.push(
      getLatestNpmVersion("@biomejs/biome", "1.9.4").then((v) => {
        versions.biome = v;
      })
    );
  }

  await Promise.all(versionPromises);
  packageOptions.versions = versions;

  // For apps, prompt for workspace dependencies
  if (packageType === "app") {
    const workspacePackages = await getWorkspacePackages(monorepoRoot);
    if (workspacePackages.length > 0) {
      const selectedDeps = await p.multiselect({
        message: "Add workspace dependencies?",
        options: workspacePackages.map((pkg) => ({
          value: pkg.name,
          label: pkg.name.replace(/^@[^/]+\//, ""),
        })),
        required: false,
      });

      if (!p.isCancel(selectedDeps) && selectedDeps.length > 0) {
        packageOptions.workspaceDependencies = selectedDeps as string[];
      }
    }
  }

  const basePath = join(monorepoRoot, packagePath);
  const s = p.spinner();
  s.start("Creating package...");

  try {
    const files = generate(packageOptions);
    const filePaths = Object.keys(files).sort();

    for (const filePath of filePaths) {
      const fullFilePath = join(basePath, filePath);
      await mkdir(dirname(fullFilePath), { recursive: true });
      const file = files[filePath]!;

      if (file.type === "text") {
        await writeFile(fullFilePath, file.content);
      } else {
        const response = await fetch(file.url);
        await writeFile(fullFilePath, response.body!);
      }
    }

    s.stop(color.green.inverse(` ✓ Package created at ${packagePath}! `));

    // Ask if user wants to add another package
    const addAnother = await p.select({
      message: "Add another package?",
      options: [
        { value: "no", label: "No, I'm done" },
        { value: "yes", label: "Yes, add another" },
      ],
      initialValue: "no",
    });

    return !p.isCancel(addAnother) && addAnother === "yes";
  } catch (error) {
    s.stop("Failed to create package");
    p.log.error(String(error));
    return false;
  }
}

/**
 * Shows editor prompt and opens project if selected.
 */
async function promptAndOpenEditor(basePath: string): Promise<void> {
  const savedEditor = getPreferredEditor();
  let selectedEditor: EditorChoice | undefined;

  if (savedEditor && savedEditor !== "skip") {
    const useDefault = await p.confirm({
      message: `Open in editor? ${color.dim(`(${editorNames[savedEditor]})`)}`,
      initialValue: true,
    });

    if (p.isCancel(useDefault)) {
      selectedEditor = undefined;
    } else if (useDefault) {
      selectedEditor = savedEditor;
    } else {
      selectedEditor = "skip";
    }
  } else {
    const openEditor = await p.select({
      message: "Open project in editor?",
      options: [
        { value: "skip", label: "Skip" },
        { value: "cursor", label: "Cursor" },
        { value: "code", label: "VS Code" },
        { value: "webstorm", label: "WebStorm" },
      ],
      initialValue: "skip",
    });

    if (!p.isCancel(openEditor)) {
      selectedEditor = openEditor as EditorChoice;

      const saveChoice = await p.confirm({
        message: `Save ${
          editorNames[selectedEditor] ?? "Skip"
        } as default editor?`,
        initialValue: true,
      });

      if (!p.isCancel(saveChoice) && saveChoice) {
        setPreferredEditor(selectedEditor);

        if (selectedEditor === "cursor" || selectedEditor === "code") {
          const reuseChoice = await p.confirm({
            message: "Reuse current window when opening projects?",
            initialValue: false,
          });

          if (!p.isCancel(reuseChoice)) {
            setReuseWindow(reuseChoice);
          }
        }
      }
    }
  }

  if (selectedEditor && selectedEditor !== "skip") {
    try {
      await openInEditor(
        selectedEditor as "cursor" | "code" | "webstorm",
        basePath,
        getReuseWindow()
      );
      p.log.success(`Opening in ${editorNames[selectedEditor]}...`);
    } catch {
      p.log.warn(
        `Could not open ${editorNames[selectedEditor]}. Make sure the CLI command is in your PATH.`
      );
    }
  }
}

async function main() {
  const program = new Command()
    .name("create-krispya")
    .description(
      "CLI for creating Vanilla, React, and React Three Fiber projects"
    )
    .argument("[name]", "name for the project")
    .option("--type <type>", "project type: app or library (default: app)")
    .option(
      "--bundler <bundler>",
      "library bundler: unbuild or tsdown (default: unbuild, only for libraries)"
    )
    .option(
      "--template <type>",
      "project template: vanilla, vanilla-js, react, react-js, r3f, r3f-js (default: vanilla)"
    )
    .option(
      "--linter <type>",
      "linter: eslint, oxlint, or biome (default: oxlint)"
    )
    .option(
      "--formatter <type>",
      "formatter: prettier, oxfmt, or biome (default: oxfmt)"
    )
    .option("--drei", "add @react-three/drei (r3f only)")
    .option("--handle", "add @react-three/handle (r3f only)")
    .option("--leva", "add leva (r3f only)")
    .option("--postprocessing", "add @react-three/postprocessing (r3f only)")
    .option("--rapier", "add @react-three/rapier (r3f only)")
    .option("--xr", "add @react-three/xr (r3f only)")
    .option("--uikit", "add @react-three/uikit (r3f only)")
    .option("--offscreen", "add @react-three/offscreen (r3f only)")
    .option("--zustand", "add zustand (r3f only)")
    .option("--koota", "add koota (r3f only)")
    .option("--triplex", "set up triplex development environment (r3f only)")
    .option("--viverse", "set up viverse deployment (r3f only)")
    .option(
      "--package-manager <manager>",
      "specify package manager (e.g. npm, yarn, pnpm)"
    )
    .option(
      "--pnpm-manage-versions",
      "enable manage-package-manager-versions in pnpm-workspace.yaml (default: true)"
    )
    .option(
      "--no-pnpm-manage-versions",
      "disable manage-package-manager-versions in pnpm-workspace.yaml"
    )
    .option(
      "--node-version <version>",
      'set Node.js version for engines.node field (default: "latest")'
    )
    .option(
      "--workspace",
      "Add package to current monorepo workspace (non-interactive)"
    )
    .option(
      "--dir <directory>",
      "Target directory for --workspace (default: apps/ or packages/)"
    )
    .option("--clear-config", "Clear saved preferences (e.g. editor choice)")
    .option("--config-path", "Print the path to the config file")
    .option(
      "--check",
      "Check if current directory is in a valid monorepo workspace"
    )
    .option("--fix", "Fix monorepo by generating missing .config packages")
    .action(async (name: string | undefined, options: CliOptions) => {
      // Short-circuit: config management flags exit immediately
      if (options.clearConfig) {
        clearConfig();
        console.log("Configuration cleared.");
        process.exit(0);
      }

      if (options.configPath) {
        console.log(getConfigPath());
        process.exit(0);
      }

      // Flag handlers for flags that may be parsed as the name argument
      const flagHandlers: Record<string, () => Promise<void> | void> = {
        "--version": () => {
          console.log(pkg.version);
          process.exit(0);
        },
        "-V": () => {
          console.log(pkg.version);
          process.exit(0);
        },
        "--help": () => program.help(),
        "-h": () => program.help(),
        "--clear-config": () => {
          clearConfig();
          console.log("Configuration cleared.");
          process.exit(0);
        },
        "--config-path": () => {
          console.log(getConfigPath());
          process.exit(0);
        },
        "--check": async () => {
          const monorepoRoot = await detectMonorepoRoot();
          if (!monorepoRoot) {
            console.log(color.red("✗") + " Not a monorepo workspace");
            process.exit(1);
          }
          const { valid, errors } = await validateWorkspace(monorepoRoot);
          if (valid) {
            console.log(color.green("✓") + " Valid monorepo workspace");
            console.log(color.dim(`  ${monorepoRoot}`));
          } else {
            console.log(color.red("✗") + " Invalid monorepo workspace");
            console.log(color.dim(`  ${monorepoRoot}`));
            for (const error of errors) {
              console.log(color.red(`  • ${error}`));
            }
          }
          process.exit(valid ? 0 : 1);
        },
      };

      // Handle flags that may have been parsed as the name argument
      if (name?.startsWith("-")) {
        // --fix is handled separately with options support
        if (name === "--fix") {
          options.fix = true;
        } else {
          const handler = flagHandlers[name];
          if (handler) {
            await handler();
          } else {
            console.error(color.red(`Unknown option: ${name}`));
            process.exit(1);
          }
        }
      }

      // Handle flags passed correctly via options
      if (options.check) {
        await flagHandlers["--check"]!();
      }

      if (options.fix) {
        // Handle --fix with optional non-interactive flags
        const monorepoRoot = await detectMonorepoRoot();
        if (!monorepoRoot) {
          console.log(color.red("✗") + " Not a monorepo workspace");
          console.log(color.dim("  Run this command from within a monorepo"));
          process.exit(1);
        }

        const { valid, errors } = await validateWorkspace(monorepoRoot);
        if (valid) {
          console.log(color.green("✓") + " Workspace is already valid");
          console.log(color.dim(`  ${monorepoRoot}`));
          process.exit(0);
        }

        console.log(color.yellow("!") + " Invalid monorepo workspace");
        for (const error of errors) {
          console.log(color.dim(`  • ${error}`));
        }
        console.log();

        const tooling = await detectWorkspaceTooling(monorepoRoot);
        const existingConfigs = await detectExistingConfigs(monorepoRoot);
        const detectedLinter = tooling.linter ?? existingConfigs.linter ?? "oxlint";
        const detectedFormatter = tooling.formatter ?? existingConfigs.formatter ?? "oxfmt";

        // Non-interactive if --linter and --formatter are provided
        const isNonInteractive = options.linter && options.formatter;

        let linter: "oxlint" | "eslint" | "biome";
        let formatter: "oxfmt" | "prettier" | "biome";

        if (isNonInteractive) {
          linter = options.linter as "oxlint" | "eslint" | "biome";
          formatter = options.formatter as "oxfmt" | "prettier" | "biome";
        } else {
          const linterChoice = await p.select({
            message: "Linter",
            options: [
              { value: "oxlint", label: "oxlint" + (tooling.linter === "oxlint" ? color.dim(" (installed)") : "") },
              { value: "eslint", label: "eslint" + (tooling.linter === "eslint" || existingConfigs.linter === "eslint" ? color.dim(" (installed)") : "") },
              { value: "biome", label: "biome" + (tooling.linter === "biome" ? color.dim(" (installed)") : "") },
            ],
            initialValue: detectedLinter,
          });

          if (p.isCancel(linterChoice)) {
            p.cancel("Operation cancelled.");
            process.exit(0);
          }

          const formatterChoice = await p.select({
            message: "Formatter",
            options: [
              { value: "oxfmt", label: "oxfmt" + (tooling.formatter === "oxfmt" ? color.dim(" (installed)") : "") },
              { value: "prettier", label: "prettier" + (tooling.formatter === "prettier" || existingConfigs.formatter === "prettier" ? color.dim(" (installed)") : "") },
              { value: "biome", label: "biome" + (tooling.formatter === "biome" ? color.dim(" (installed)") : "") },
            ],
            initialValue: detectedFormatter,
          });

          if (p.isCancel(formatterChoice)) {
            p.cancel("Operation cancelled.");
            process.exit(0);
          }

          linter = linterChoice as "oxlint" | "eslint" | "biome";
          formatter = formatterChoice as "oxfmt" | "prettier" | "biome";
        }

        console.log();
        const s = p.spinner();
        s.start("Fixing workspace...");

        try {
          const files: Record<string, { type: "text"; content: string }> = {};

          const tsConfigExists = await fileExists(join(monorepoRoot, ".config/typescript/package.json"));
          if (!tsConfigExists) {
            generateTypescriptConfigPackage(files);
          }

          if (linter === "oxlint") {
            const oxlintExists = await fileExists(join(monorepoRoot, ".config/oxlint/package.json"));
            if (!oxlintExists) generateOxlintConfigPackage(files);
          } else if (linter === "eslint") {
            const eslintPkgExists = await fileExists(join(monorepoRoot, ".config/eslint/package.json"));
            if (!eslintPkgExists) {
              if (existingConfigs.eslintConfigPath) {
                await migrateEslintConfig(monorepoRoot, files);
              } else {
                generateEslintConfigPackage(files);
              }
            }
          }

          if (formatter === "oxfmt") {
            const oxfmtExists = await fileExists(join(monorepoRoot, ".config/oxfmt/package.json"));
            if (!oxfmtExists) generateOxfmtConfigPackage(files);
          } else if (formatter === "prettier") {
            const prettierPkgExists = await fileExists(join(monorepoRoot, ".config/prettier/package.json"));
            if (!prettierPkgExists) {
              if (existingConfigs.prettierConfigPath) {
                await migratePrettierConfig(monorepoRoot, files);
              } else {
                generatePrettierConfigPackage(files);
              }
            }
          }

          for (const [filePath, file] of Object.entries(files)) {
            const fullPath = join(monorepoRoot, filePath);
            await mkdir(dirname(fullPath), { recursive: true });
            await writeFile(fullPath, file.content);
          }

          await ensureConfigInWorkspace(monorepoRoot);

          if (existingConfigs.eslintConfigPath && linter === "eslint") {
            try { await unlink(existingConfigs.eslintConfigPath); } catch {}
          }
          if (existingConfigs.prettierConfigPath && formatter === "prettier") {
            try { await unlink(existingConfigs.prettierConfigPath); } catch {}
          }

          s.stop(color.green("✓") + " Workspace fixed!");

          const generated = Object.keys(files).filter((f) => f.endsWith("package.json"));
          for (const pkg of generated) {
            const pkgName = pkg.replace("/package.json", "");
            console.log(color.dim(`  Generated ${pkgName}`));
          }

          // VS Code and AI files - skip prompts in non-interactive mode unless explicitly requested
          const vscodeExists = await fileExists(join(monorepoRoot, ".vscode/settings.json"));

          if (!vscodeExists) {
            let addVscode = false;
            if (isNonInteractive) {
              // In non-interactive mode, generate VS Code files by default
              addVscode = true;
            } else {
              const vscodeChoice = await p.confirm({
                message: "Generate VS Code settings?",
                initialValue: true,
              });
              addVscode = !p.isCancel(vscodeChoice) && vscodeChoice;
            }

            if (addVscode) {
              const vscodeFiles: Record<string, { type: "text"; content: string }> = {};
              generateVscodeFiles(vscodeFiles, linter, formatter);
              for (const [filePath, file] of Object.entries(vscodeFiles)) {
                const fullPath = join(monorepoRoot, filePath);
                await mkdir(dirname(fullPath), { recursive: true });
                await writeFile(fullPath, file.content);
              }
              console.log(color.dim("  Generated .vscode/settings.json"));
              console.log(color.dim("  Generated .vscode/extensions.json"));
            }
          }

          // AI files
          let selectedAiFiles: AiFileChoice[] = [];
          const savedAiFiles = getAiFiles();

          if (isNonInteractive) {
            // In non-interactive mode, use saved preference or default to cursor-rules
            selectedAiFiles = savedAiFiles ?? ["cursor-rules"];
          } else if (savedAiFiles && savedAiFiles.length > 0) {
            const aiFileLabels: Record<AiFileChoice, string> = {
              "cursor-rules": ".cursor/rules",
              "agents-md": "AGENTS.md",
              "claude-md": "CLAUDE.md",
              "copilot-md": ".github/copilot-instructions.md",
            };
            const savedLabels = savedAiFiles.map((f) => aiFileLabels[f]).join(", ");
            const useDefault = await p.confirm({
              message: `Generate AI instruction files? ${color.dim(`(${savedLabels})`)}`,
              initialValue: true,
            });
            if (!p.isCancel(useDefault) && useDefault) {
              selectedAiFiles = savedAiFiles;
            }
          } else {
            const aiFilesChoice = await p.multiselect({
              message: "Generate AI instruction files?",
              options: [
                { value: "cursor-rules", label: ".cursor/rules", hint: "Cursor AI" },
                { value: "agents-md", label: "AGENTS.md", hint: "GitHub Copilot, general" },
                { value: "claude-md", label: "CLAUDE.md", hint: "Claude" },
                { value: "copilot-md", label: ".github/copilot-instructions.md", hint: "GitHub Copilot" },
              ],
              required: false,
            });
            if (!p.isCancel(aiFilesChoice) && aiFilesChoice.length > 0) {
              selectedAiFiles = aiFilesChoice as AiFileChoice[];
              const saveChoice = await p.confirm({ message: "Save as default for future?", initialValue: true });
              if (!p.isCancel(saveChoice) && saveChoice) {
                setAiFiles(selectedAiFiles);
              }
            }
          }

          if (selectedAiFiles.length > 0) {
            const scope = await getMonorepoScope(monorepoRoot);
            const aiFilesOutput: Record<string, { type: "text"; content: string }> = {};
            generateAiFiles(aiFilesOutput, {
              name: scope,
              packageManager: "pnpm",
              linter,
              formatter,
              aiFiles: selectedAiFiles,
            });
            for (const [filePath, file] of Object.entries(aiFilesOutput)) {
              const fullPath = join(monorepoRoot, filePath);
              await mkdir(dirname(fullPath), { recursive: true });
              await writeFile(fullPath, file.content);
              console.log(color.dim(`  Generated ${filePath}`));
            }
          }

          process.exit(0);
        } catch (error) {
          s.stop(color.red("✗") + " Failed to fix workspace");
          console.error(error);
          process.exit(1);
        }
      }

      // Validate --dir requires --workspace
      if (options.dir && !options.workspace) {
        console.error(
          color.red("Error:") + " --dir requires --workspace flag"
        );
        console.log(
          color.dim(
            "  Example: pnpm create krispya my-lib --workspace --dir examples"
          )
        );
        process.exit(1);
      }

      // Handle --workspace flag for non-interactive package creation in monorepo
      if (options.workspace) {
        const monorepoRoot = await detectMonorepoRoot();
        if (!monorepoRoot) {
          console.error(
            color.red("Error:") +
              " --workspace flag requires being inside a monorepo"
          );
          process.exit(1);
        }

        if (!name) {
          console.error(
            color.red("Error:") +
              " Package name is required with --workspace flag"
          );
          console.log(
            color.dim(
              "  Example: pnpm create krispya my-lib --workspace --type library"
            )
          );
          process.exit(1);
        }

        const scope = await getMonorepoScope(monorepoRoot);
        const inheritedTooling = await detectWorkspaceTooling(monorepoRoot);
        const projectType: ProjectType = options.type ?? "app";
        const defaultDir = projectType === "library" ? "packages" : "apps";
        const targetDir = options.dir ?? defaultDir;
        const template: Template = options.template ?? "vanilla";
        const baseTemplate = getBaseTemplate(template);

        // Build scoped package name
        const scopedName = name.startsWith("@") ? name : `@${scope}/${name}`;

        // Check if directory already exists
        const packagePath = join(monorepoRoot, targetDir, name);
        try {
          await access(packagePath, constants.F_OK);
          console.error(
            color.red("Error:") + ` Directory ${targetDir}/${name} already exists`
          );
          process.exit(1);
        } catch {
          // Directory doesn't exist, which is what we want
        }

        // Fetch versions
        const versions: PackageVersions = {};
        const versionPromises: Promise<void>[] = [];

        const isLibrary = projectType === "library";
        if (!isLibrary) {
          versionPromises.push(
            getLatestNpmVersion("vite", "6.3.4").then((v) => {
              versions.vite = v;
            })
          );
        }

        const linter = inheritedTooling.linter ?? options.linter ?? "oxlint";
        const formatter =
          inheritedTooling.formatter ?? options.formatter ?? "oxfmt";

        await Promise.all(versionPromises);

        const generateOptions: GenerateOptions = {
          name: scopedName,
          projectType,
          libraryBundler: isLibrary ? options.bundler ?? "unbuild" : undefined,
          template,
          linter,
          formatter,
          workspaceRoot: "../..",
          versions,
          ...(baseTemplate === "r3f" && {
            drei: options.drei ? {} : undefined,
            handle: options.handle ? {} : undefined,
            leva: options.leva ? {} : undefined,
            postprocessing: options.postprocessing ? {} : undefined,
            rapier: options.rapier ? {} : undefined,
            xr: options.xr ? {} : undefined,
            uikit: options.uikit ? {} : undefined,
            offscreen: options.offscreen ? {} : undefined,
            zustand: options.zustand ? {} : undefined,
            koota: options.koota ? {} : undefined,
            viverse: options.viverse ? {} : undefined,
            triplex: options.triplex ? {} : undefined,
          }),
        };

        console.log(
          color.cyan("Creating") +
            ` ${scopedName} in ${targetDir}/${name}...`
        );

        try {
          const files = generate(generateOptions);
          const filePaths = Object.keys(files).sort();

          for (const filePath of filePaths) {
            const fullFilePath = join(packagePath, filePath);
            await mkdir(dirname(fullFilePath), { recursive: true });
            const file = files[filePath]!;

            if (file.type === "text") {
              await writeFile(fullFilePath, file.content);
            } else {
              const response = await fetch(file.url);
              await writeFile(fullFilePath, response.body!);
            }
          }

          console.log(
            color.green("✓") + ` Created ${scopedName} at ${targetDir}/${name}`
          );
          process.exit(0);
        } catch (error) {
          console.error(color.red("Error:") + " Failed to create package");
          console.error(String(error));
          process.exit(1);
        }
      }

      console.clear();
      p.intro(color.bgCyan(color.black(` create-krispya v${pkg.version} `)));

      // Check if we're inside a monorepo workspace
      const monorepoRoot = await detectMonorepoRoot();
      if (monorepoRoot && Object.keys(options).length === 0) {
        // Detected monorepo - prompt to add package or create standalone
        const choice = await p.select({
          message: "Detected monorepo workspace",
          options: [
            { value: "add", label: "Add new package to this workspace" },
            { value: "standalone", label: "Create standalone project" },
          ],
          initialValue: "add",
        });

        if (p.isCancel(choice)) {
          p.cancel("Operation cancelled.");
          process.exit(0);
        }

        if (choice === "add") {
          // Detect workspace tooling for inherited settings
          const inheritedTooling = await detectWorkspaceTooling(monorepoRoot);
          if (inheritedTooling.linter || inheritedTooling.formatter) {
            const toolingInfo = [
              inheritedTooling.linter && `linter: ${inheritedTooling.linter}`,
              inheritedTooling.formatter &&
                `formatter: ${inheritedTooling.formatter}`,
            ]
              .filter(Boolean)
              .join(", ");
            p.log.info(`Using workspace tooling (${toolingInfo})`);
          }

          // Get monorepo scope for package naming
          const scope = await getMonorepoScope(monorepoRoot);

          // Package creation loop
          let addMore = true;
          while (addMore) {
            addMore = await createPackageInWorkspace(
              monorepoRoot,
              "pnpm",
              inheritedTooling,
              scope
            );
          }

          // Show next steps
          p.note(
            [`cd ${monorepoRoot}`, "pnpm install", "pnpm run dev"].join("\n"),
            "Next steps"
          );

          // Offer to open in editor
          await promptAndOpenEditor(monorepoRoot);

          p.outro(color.green("Happy coding! ✨"));
          process.exit(0);
        }
        // If standalone, continue with normal flow below
      }

      let generateOptions: GenerateOptions;

      if (Object.keys(options).length > 0) {
        const template: Template = options.template ?? "vanilla";
        const baseTemplate = getBaseTemplate(template);
        const defaultName = getDefaultProjectName(template);
        const projectType: ProjectType = options.type ?? "app";

        generateOptions = {
          name: name || defaultName,
          projectType,
          libraryBundler:
            projectType === "library"
              ? options.bundler ?? "unbuild"
              : undefined,
          template,
          linter: options.linter ?? "oxlint",
          formatter: options.formatter ?? "oxfmt",
          ...(baseTemplate === "r3f" && {
            drei: options.drei ? {} : undefined,
            handle: options.handle ? {} : undefined,
            leva: options.leva ? {} : undefined,
            postprocessing: options.postprocessing ? {} : undefined,
            rapier: options.rapier ? {} : undefined,
            xr: options.xr ? {} : undefined,
            uikit: options.uikit ? {} : undefined,
            offscreen: options.offscreen ? {} : undefined,
            zustand: options.zustand ? {} : undefined,
            koota: options.koota ? {} : undefined,
            viverse: options.viverse ? {} : undefined,
            triplex: options.triplex ? {} : undefined,
          }),
          packageManager: options.packageManager,
          pnpmManageVersions: options.pnpmManageVersions,
          nodeVersion: options.nodeVersion ?? "latest",
        };
      } else {
        generateOptions = await promptForOptions(name);
      }

      // Handle monorepo generation differently
      if (generateOptions.projectType === "monorepo") {
        // Import generateMonorepo dynamically
        const { generateMonorepo } = await import("./generators/monorepo.js");

        // Fetch package manager version
        const packageManager = generateOptions.packageManager || "pnpm";
        if (packageManager === "pnpm") {
          generateOptions.pnpmVersion = await getLatestPnpmVersion();
        } else if (packageManager === "yarn") {
          generateOptions.yarnVersion = await getLatestYarnVersion();
        } else if (packageManager === "npm") {
          generateOptions.npmVersion = await getLatestNpmCliVersion();
        }

        // Fetch Node version
        const nodeVersion = generateOptions.nodeVersion ?? "latest";
        if (nodeVersion === "latest") {
          generateOptions.nodeVersion = await getLatestNodeVersion();
        }

        // Prompt for AI instruction files
        const savedAiFiles = getAiFiles();
        let selectedAiFiles: AiFileChoice[] = [];

        if (savedAiFiles && savedAiFiles.length > 0) {
          // User has saved preference - show confirm prompt
          const aiFileLabels: Record<AiFileChoice, string> = {
            "cursor-rules": ".cursor/rules",
            "agents-md": "AGENTS.md",
            "claude-md": "CLAUDE.md",
            "copilot-md": ".github/copilot-instructions.md",
          };
          const savedLabels = savedAiFiles.map((f) => aiFileLabels[f]).join(", ");

          const useDefault = await p.confirm({
            message: `Generate AI instruction files? ${color.dim(`(${savedLabels})`)}`,
            initialValue: true,
          });

          if (!p.isCancel(useDefault) && useDefault) {
            selectedAiFiles = savedAiFiles;
          }
        } else {
          // No saved preference - show multiselect
          const aiFilesChoice = await p.multiselect({
            message: "Generate AI instruction files?",
            options: [
              { value: "cursor-rules", label: ".cursor/rules", hint: "Cursor AI" },
              { value: "agents-md", label: "AGENTS.md", hint: "GitHub Copilot, general" },
              { value: "claude-md", label: "CLAUDE.md", hint: "Claude" },
              { value: "copilot-md", label: ".github/copilot-instructions.md", hint: "GitHub Copilot" },
            ],
            required: false,
          });

          if (!p.isCancel(aiFilesChoice) && aiFilesChoice.length > 0) {
            selectedAiFiles = aiFilesChoice as AiFileChoice[];

            // Offer to save preference
            const saveChoice = await p.confirm({
              message: "Save as default for future monorepos?",
              initialValue: true,
            });

            if (!p.isCancel(saveChoice) && saveChoice) {
              setAiFiles(selectedAiFiles);
            }
          }
        }

        const basePath = join(cwd(), generateOptions.name);
        const s = p.spinner();
        s.start("Creating monorepo workspace...");

        try {
          const { files } = generateMonorepo({
            name: generateOptions.name,
            linter: generateOptions.linter ?? "oxlint",
            formatter: generateOptions.formatter ?? "oxfmt",
            packageManager,
            pnpmVersion: generateOptions.pnpmVersion,
            pnpmManageVersions: generateOptions.pnpmManageVersions,
            nodeVersion: generateOptions.nodeVersion,
            aiFiles: selectedAiFiles.length > 0 ? selectedAiFiles : undefined,
          });

          // Write all files
          const filePaths = Object.keys(files).sort();
          for (const filePath of filePaths) {
            const fullFilePath = join(basePath, filePath);
            await mkdir(dirname(fullFilePath), { recursive: true });
            const file = files[filePath]!;

            if (file.type === "text") {
              await writeFile(fullFilePath, file.content);
            }
          }

          s.stop(color.green.inverse(" ✓ Monorepo workspace created! "));

          // For new monorepos, tooling comes from generate options (no inheritance needed yet)
          const newMonorepoTooling: WorkspaceTooling = {
            linter: generateOptions.linter,
            formatter: generateOptions.formatter,
          };

          // Use the monorepo name as the scope
          const scope = generateOptions.name;

          // Package creation loop
          let addMore = true;
          while (addMore) {
            addMore = await createPackageInWorkspace(
              basePath,
              packageManager,
              newMonorepoTooling,
              scope
            );
          }

          const nextSteps = [
            `cd ${generateOptions.name}`,
            `${packageManager} install`,
            `${packageManager} run dev`,
          ].join("\n");

          p.note(nextSteps, "Next steps");

          // Offer to open in editor
          await promptAndOpenEditor(basePath);

          p.outro(color.green("Happy coding! ✨"));
          process.exit(0);
        } catch (error) {
          s.stop("Failed to create monorepo workspace");
          p.log.error(String(error));
          process.exit(1);
        }
      }

      const base = generateOptions.template
        ? getBaseTemplate(generateOptions.template)
        : "vanilla";
      const defaultFallbackName =
        base === "vanilla"
          ? "vanilla-app"
          : base === "react"
          ? "react-app"
          : "react-three-app";
      generateOptions.name ??= defaultFallbackName;

      // Fetch latest package manager version
      const packageManager = generateOptions.packageManager || "pnpm";
      if (packageManager === "pnpm") {
        generateOptions.pnpmVersion = await getLatestPnpmVersion();
      } else if (packageManager === "yarn") {
        generateOptions.yarnVersion = await getLatestYarnVersion();
      } else if (packageManager === "npm") {
        generateOptions.npmVersion = await getLatestNpmCliVersion();
      }

      // Fetch latest Node version if "latest" is specified or default
      const nodeVersion = generateOptions.nodeVersion ?? "latest";
      if (nodeVersion === "latest") {
        generateOptions.nodeVersion = await getLatestNodeVersion();
      }

      // Fetch latest package versions in parallel
      const versions: PackageVersions = {};
      const versionPromises: Promise<void>[] = [];

      // Only fetch vitest version if testing is enabled
      const isLibrary = generateOptions.projectType === "library";
      const testing =
        generateOptions.testing ?? (isLibrary ? "vitest" : "none");
      if (testing === "vitest") {
        versionPromises.push(
          getLatestNpmVersion("vitest", "4.0.0").then((v) => {
            versions.vitest = v;
          })
        );
      }

      // Only fetch vite version for apps
      if (!isLibrary) {
        versionPromises.push(
          getLatestNpmVersion("vite", "6.3.4").then((v) => {
            versions.vite = v;
          })
        );
      }

      // Fetch linter version
      const linter = generateOptions.linter ?? "oxlint";
      if (linter === "eslint") {
        versionPromises.push(
          getLatestNpmVersion("eslint", "9.17.0").then((v) => {
            versions.eslint = v;
          })
        );
      } else if (linter === "oxlint") {
        versionPromises.push(
          getLatestNpmVersion("oxlint", "0.16.0").then((v) => {
            versions.oxlint = v;
          })
        );
      } else if (linter === "biome") {
        versionPromises.push(
          getLatestNpmVersion("@biomejs/biome", "1.9.4").then((v) => {
            versions.biome = v;
          })
        );
      }

      // Fetch formatter version
      const formatter = generateOptions.formatter ?? "oxfmt";
      if (formatter === "prettier") {
        versionPromises.push(
          getLatestNpmVersion("prettier", "3.4.2").then((v) => {
            versions.prettier = v;
          })
        );
      } else if (formatter === "oxfmt") {
        versionPromises.push(
          getLatestNpmVersion("oxfmt", "0.1.0").then((v) => {
            versions.oxfmt = v;
          })
        );
      } else if (formatter === "biome" && linter !== "biome") {
        // Only fetch if not already fetched for linter
        versionPromises.push(
          getLatestNpmVersion("@biomejs/biome", "1.9.4").then((v) => {
            versions.biome = v;
          })
        );
      }

      await Promise.all(versionPromises);
      generateOptions.versions = versions;

      const basePath = join(cwd(), generateOptions.name);
      const s = p.spinner();
      s.start("Creating project...");

      try {
        const files = generate(generateOptions);
        const filePaths = Object.keys(files).sort();

        for (const filePath of filePaths) {
          const fullFilePath = join(basePath, filePath);
          await mkdir(dirname(fullFilePath), { recursive: true });
          const file = files[filePath]!;

          if (file.type === "text") {
            await writeFile(fullFilePath, file.content);
          } else {
            const response = await fetch(file.url);
            await writeFile(fullFilePath, response.body!);
          }
        }

        s.stop(color.green.inverse(" ✓ Project created! "));

        const isLibrary = generateOptions.projectType === "library";
        const nextSteps = isLibrary
          ? [
              `cd ${generateOptions.name}`,
              `${packageManager} install`,
              `${packageManager} run build`,
            ].join("\n")
          : [
              `cd ${generateOptions.name}`,
              `${packageManager} install`,
              `${packageManager} run dev`,
            ].join("\n");

        p.note(nextSteps, "Next steps");

        const savedEditor = getPreferredEditor();
        let selectedEditor: EditorChoice | undefined;

        if (savedEditor && savedEditor !== "skip") {
          // Saved preference exists - show confirm prompt
          const useDefault = await p.confirm({
            message: `Open in editor? ${color.dim(
              `(${editorNames[savedEditor]})`
            )}`,
            initialValue: true,
          });

          if (p.isCancel(useDefault)) {
            selectedEditor = undefined;
          } else if (useDefault) {
            selectedEditor = savedEditor;
          } else {
            selectedEditor = "skip";
          }
        } else {
          // No saved preference - show full selection
          const openEditor = await p.select({
            message: "Open project in editor?",
            options: [
              { value: "skip", label: "Skip" },
              { value: "cursor", label: "Cursor" },
              { value: "code", label: "VS Code" },
              { value: "webstorm", label: "WebStorm" },
            ],
            initialValue: "skip",
          });

          if (!p.isCancel(openEditor)) {
            selectedEditor = openEditor as EditorChoice;

            // Ask to save preference
            const saveChoice = await p.confirm({
              message: `Save ${
                editorNames[selectedEditor] ?? "Skip"
              } as default editor?`,
              initialValue: true,
            });

            if (!p.isCancel(saveChoice) && saveChoice) {
              setPreferredEditor(selectedEditor);

              // Ask about window preference (only for editors that support it)
              if (selectedEditor === "cursor" || selectedEditor === "code") {
                const reuseChoice = await p.confirm({
                  message: "Reuse current window when opening projects?",
                  initialValue: false,
                });

                if (!p.isCancel(reuseChoice)) {
                  setReuseWindow(reuseChoice);
                }
              }
            }
          }
        }

        if (selectedEditor && selectedEditor !== "skip") {
          try {
            await openInEditor(
              selectedEditor as "cursor" | "code" | "webstorm",
              basePath,
              getReuseWindow()
            );
            p.log.success(`Opening in ${editorNames[selectedEditor]}...`);
          } catch {
            p.log.warn(
              `Could not open ${editorNames[selectedEditor]}. Make sure the CLI command is in your PATH.`
            );
          }
        }

        p.outro(color.green("Happy coding! ✨"));
      } catch (error) {
        s.stop("Failed to create project");
        p.log.error(String(error));
        process.exit(1);
      }
    });

  await program.parseAsync();
}

main().catch(console.error);
