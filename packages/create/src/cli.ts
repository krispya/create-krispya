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
  type File,
  type GenerateOptions,
  type LibraryBundler,
  type PackageVersions,
  type ProjectType,
  type Template,
} from "./index.js";
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

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

// =============================================================================
// Types
// =============================================================================

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
  path?: string;
}

type WorkspaceTooling = {
  linter?: "oxlint" | "eslint" | "biome";
  formatter?: "oxfmt" | "prettier" | "biome";
};

type WorkspacePackage = {
  name: string;
  path: string;
};

interface ExistingConfigs {
  linter?: "oxlint" | "eslint" | "biome";
  formatter?: "prettier" | "biome";
  eslintConfigPath?: string;
  prettierConfigPath?: string;
  biomeConfigPath?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

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

/**
 * Writes generated files to disk.
 */
async function writeGeneratedFiles(
  basePath: string,
  files: Record<string, File>
): Promise<void> {
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
}

/**
 * Calculates the relative path from a package directory back to the monorepo root.
 */
function calculateWorkspaceRoot(packagePath: string): string {
  const segments = packagePath.split(/[/\\]/).filter(Boolean);
  return segments.map(() => "..").join("/");
}

// =============================================================================
// Monorepo Detection & Parsing
// =============================================================================

/**
 * Detects if the current directory is inside a monorepo workspace.
 */
async function detectMonorepoRoot(): Promise<string | null> {
  let currentDir = cwd();
  const root = resolve("/");

  while (currentDir !== root) {
    const workspaceFile = join(currentDir, "pnpm-workspace.yaml");
    try {
      await access(workspaceFile, constants.F_OK);
      const content = await readFile(workspaceFile, "utf-8");
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

/**
 * Detects linter and formatter from the monorepo root package.json.
 */
async function detectWorkspaceTooling(
  monorepoRoot: string
): Promise<WorkspaceTooling> {
  try {
    const pkgPath = join(monorepoRoot, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkgJson = JSON.parse(content) as {
      devDependencies?: Record<string, string>;
    };
    const devDeps = pkgJson.devDependencies ?? {};

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
 * Detects existing root config files that may need migration.
 */
async function detectExistingConfigs(
  monorepoRoot: string
): Promise<ExistingConfigs> {
  const configs: ExistingConfigs = {};

  const eslintPath = join(monorepoRoot, "eslint.config.js");
  if (await fileExists(eslintPath)) {
    configs.linter = "eslint";
    configs.eslintConfigPath = eslintPath;
  }

  const prettierPath = join(monorepoRoot, ".prettierrc.json");
  if (await fileExists(prettierPath)) {
    configs.formatter = "prettier";
    configs.prettierConfigPath = prettierPath;
  }

  const biomePath = join(monorepoRoot, "biome.json");
  if (await fileExists(biomePath)) {
    configs.biomeConfigPath = biomePath;
    if (!configs.linter) configs.linter = "biome";
    if (!configs.formatter) configs.formatter = "biome";
  }

  return configs;
}

/**
 * Gets the monorepo scope name from root package.json name field or directory name.
 */
async function getMonorepoScope(monorepoRoot: string): Promise<string> {
  try {
    const pkgPath = join(monorepoRoot, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkgJson = JSON.parse(content) as { name?: string };
    if (pkgJson.name) {
      return pkgJson.name.replace(/^@/, "").replace(/\/.*$/, "");
    }
  } catch {
    // Fall through to directory name
  }
  return monorepoRoot.split(/[/\\]/).pop() ?? "workspace";
}

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
          const pkgJson = JSON.parse(content) as { name?: string };
          if (pkgJson.name) {
            packages.push({
              name: pkgJson.name,
              path: `packages/${entry.name}`,
            });
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
 * Ensures .config/* is in pnpm-workspace.yaml packages array.
 */
async function ensureConfigInWorkspace(monorepoRoot: string): Promise<void> {
  const workspacePath = join(monorepoRoot, "pnpm-workspace.yaml");

  let content: string;
  try {
    content = await readFile(workspacePath, "utf-8");
  } catch {
    content = `packages:
  - ".config/*"
  - "packages/*"
`;
    await writeFile(workspacePath, content);
    return;
  }

  if (content.includes(".config/*") || content.includes('".config/*"')) {
    return;
  }

  const lines = content.split("\n");
  const packagesIndex = lines.findIndex((line) =>
    line.trim().startsWith("packages:")
  );

  if (packagesIndex === -1) {
    content = `packages:
  - ".config/*"
${content}`;
  } else {
    lines.splice(packagesIndex + 1, 0, '  - ".config/*"');
    content = lines.join("\n");
  }

  await writeFile(workspacePath, content);
}

// =============================================================================
// Config Migration
// =============================================================================

/**
 * Migrates an existing eslint.config.js to .config/eslint package.
 */
async function migrateEslintConfig(
  monorepoRoot: string,
  files: Record<string, { type: "text"; content: string }>
): Promise<void> {
  const configBasePath = ".config/eslint";
  const existingConfigPath = join(monorepoRoot, "eslint.config.js");

  let existingContent: string;
  try {
    existingContent = await readFile(existingConfigPath, "utf-8");
  } catch {
    generateEslintConfigPackage(files);
    return;
  }

  files[`${configBasePath}/package.json`] = {
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

  files[`${configBasePath}/README.md`] = {
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

  files[`${configBasePath}/base.js`] = {
    type: "text",
    content: existingContent,
  };

  files[`${configBasePath}/react.js`] = {
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
  const configBasePath = ".config/prettier";
  const existingConfigPath = join(monorepoRoot, ".prettierrc.json");

  let existingContent: string;
  try {
    existingContent = await readFile(existingConfigPath, "utf-8");
  } catch {
    generatePrettierConfigPackage(files);
    return;
  }

  files[`${configBasePath}/package.json`] = {
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

  files[`${configBasePath}/README.md`] = {
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

  files[`${configBasePath}/base.json`] = {
    type: "text",
    content: existingContent,
  };
}

// =============================================================================
// Interactive Package Creation
// =============================================================================

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
  const workspaceDirectories = await parseWorkspaceDirectories(monorepoRoot);
  const defaultDirectories = ["apps", "packages"];
  const hasCustomDirectories =
    workspaceDirectories.length > 0 &&
    !workspaceDirectories.every((dir) => defaultDirectories.includes(dir));

  const packageType = await promptForInitialPackage();

  if (packageType === "skip") {
    return false;
  }

  const defaultDir = packageType === "app" ? "apps" : "packages";

  const packageNameInput = await p.text({
    message: "Package name?",
    placeholder: `Scoped to @${scope}/`,
    validate: (value) => {
      const validationError = validatePackageName(value);
      if (validationError) return validationError;

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

  const shortName = packageNameInput as string;
  const scopedName = `@${scope}/${shortName}`;

  const packageOptions = await promptForPackageOptions(
    scopedName,
    packageType,
    inheritedTooling
  );

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

  const relativePkgPath = join(targetDir, shortName);
  const workspaceRoot = calculateWorkspaceRoot(relativePkgPath);

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
        options: workspacePackages.map((pkgInfo) => ({
          value: pkgInfo.name,
          label: pkgInfo.name.replace(/^@[^/]+\//, ""),
        })),
        required: false,
      });

      if (!p.isCancel(selectedDeps) && selectedDeps.length > 0) {
        packageOptions.workspaceDependencies = selectedDeps as string[];
      }
    }
  }

  const outputPath = join(monorepoRoot, relativePkgPath);
  const spinner = p.spinner();
  spinner.start("Creating package...");

  try {
    const files = generate(packageOptions);
    await writeGeneratedFiles(outputPath, files);

    spinner.stop(
      color.green.inverse(` ✓ Package created at ${relativePkgPath}! `)
    );

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
    spinner.stop("Failed to create package");
    p.log.error(String(error));
    return false;
  }
}

/**
 * Shows editor prompt and opens project if selected.
 */
async function promptAndOpenEditor(projectPath: string): Promise<void> {
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
        projectPath,
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

// =============================================================================
// Command Handlers
// =============================================================================

/**
 * Handles the --check command to validate a monorepo workspace.
 */
async function handleCheckCommand(): Promise<void> {
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
}

/**
 * Handles the --fix command to fix a monorepo workspace.
 */
async function handleFixCommand(options: CliOptions): Promise<void> {
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
  const detectedFormatter =
    tooling.formatter ?? existingConfigs.formatter ?? "oxfmt";

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
        {
          value: "oxlint",
          label:
            "oxlint" +
            (tooling.linter === "oxlint" ? color.dim(" (installed)") : ""),
        },
        {
          value: "eslint",
          label:
            "eslint" +
            (tooling.linter === "eslint" || existingConfigs.linter === "eslint"
              ? color.dim(" (installed)")
              : ""),
        },
        {
          value: "biome",
          label:
            "biome" +
            (tooling.linter === "biome" ? color.dim(" (installed)") : ""),
        },
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
        {
          value: "oxfmt",
          label:
            "oxfmt" +
            (tooling.formatter === "oxfmt" ? color.dim(" (installed)") : ""),
        },
        {
          value: "prettier",
          label:
            "prettier" +
            (tooling.formatter === "prettier" ||
            existingConfigs.formatter === "prettier"
              ? color.dim(" (installed)")
              : ""),
        },
        {
          value: "biome",
          label:
            "biome" +
            (tooling.formatter === "biome" ? color.dim(" (installed)") : ""),
        },
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
  const spinner = p.spinner();
  spinner.start("Fixing workspace...");

  try {
    const files: Record<string, { type: "text"; content: string }> = {};

    const tsConfigExists = await fileExists(
      join(monorepoRoot, ".config/typescript/package.json")
    );
    if (!tsConfigExists) {
      generateTypescriptConfigPackage(files);
    }

    if (linter === "oxlint") {
      const oxlintExists = await fileExists(
        join(monorepoRoot, ".config/oxlint/package.json")
      );
      if (!oxlintExists) generateOxlintConfigPackage(files);
    } else if (linter === "eslint") {
      const eslintPkgExists = await fileExists(
        join(monorepoRoot, ".config/eslint/package.json")
      );
      if (!eslintPkgExists) {
        if (existingConfigs.eslintConfigPath) {
          await migrateEslintConfig(monorepoRoot, files);
        } else {
          generateEslintConfigPackage(files);
        }
      }
    }

    if (formatter === "oxfmt") {
      const oxfmtExists = await fileExists(
        join(monorepoRoot, ".config/oxfmt/package.json")
      );
      if (!oxfmtExists) generateOxfmtConfigPackage(files);
    } else if (formatter === "prettier") {
      const prettierPkgExists = await fileExists(
        join(monorepoRoot, ".config/prettier/package.json")
      );
      if (!prettierPkgExists) {
        if (existingConfigs.prettierConfigPath) {
          await migratePrettierConfig(monorepoRoot, files);
        } else {
          generatePrettierConfigPackage(files);
        }
      }
    }

    // Biome uses root biome.json (not a .config package)
    if (
      (linter === "biome" || formatter === "biome") &&
      !existingConfigs.biomeConfigPath
    ) {
      const biomeConfig = {
        $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
        vcs: {
          enabled: true,
          clientKind: "git",
          useIgnoreFile: true,
        },
        linter: {
          enabled: linter === "biome",
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

    for (const [filePath, file] of Object.entries(files)) {
      const fullPath = join(monorepoRoot, filePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content);
    }

    await ensureConfigInWorkspace(monorepoRoot);

    if (existingConfigs.eslintConfigPath && linter === "eslint") {
      try {
        await unlink(existingConfigs.eslintConfigPath);
      } catch {}
    }
    if (existingConfigs.prettierConfigPath && formatter === "prettier") {
      try {
        await unlink(existingConfigs.prettierConfigPath);
      } catch {}
    }

    spinner.stop(color.green("✓") + " Workspace fixed!");

    const generated = Object.keys(files).filter((f) =>
      f.endsWith("package.json")
    );
    for (const pkgFile of generated) {
      const pkgName = pkgFile.replace("/package.json", "");
      console.log(color.dim(`  Generated ${pkgName}`));
    }

    // VS Code files
    const vscodeSettingsExists = await fileExists(
      join(monorepoRoot, ".vscode/settings.json")
    );
    const vscodeExtensionsExists = await fileExists(
      join(monorepoRoot, ".vscode/extensions.json")
    );
    const vscodeExists = vscodeSettingsExists && vscodeExtensionsExists;

    if (!vscodeExists) {
      let addVscode = false;
      if (isNonInteractive) {
        addVscode = true;
      } else {
        const vscodeChoice = await p.confirm({
          message: "Generate VS Code settings?",
          initialValue: true,
        });
        addVscode = !p.isCancel(vscodeChoice) && vscodeChoice;
      }

      if (addVscode) {
        const vscodeFiles: Record<string, { type: "text"; content: string }> =
          {};
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
    const aiFilePaths: Record<AiFileChoice, string> = {
      "cursor-rules": ".cursor/rules",
      "agents-md": "AGENTS.md",
      "claude-md": "CLAUDE.md",
      "copilot-md": ".github/copilot-instructions.md",
    };

    const existingAiFiles: AiFileChoice[] = [];
    for (const [choice, path] of Object.entries(aiFilePaths)) {
      if (await fileExists(join(monorepoRoot, path))) {
        existingAiFiles.push(choice as AiFileChoice);
      }
    }

    let selectedAiFiles: AiFileChoice[] = [];
    const savedAiFiles = getAiFiles();

    const availableChoices: AiFileChoice[] = (
      ["cursor-rules", "agents-md", "claude-md", "copilot-md"] as AiFileChoice[]
    ).filter((c) => !existingAiFiles.includes(c));

    if (availableChoices.length === 0) {
      // All AI files already exist, skip
    } else if (isNonInteractive) {
      const preferred = savedAiFiles ?? ["cursor-rules"];
      selectedAiFiles = preferred.filter((f) => availableChoices.includes(f));
    } else if (savedAiFiles && savedAiFiles.length > 0) {
      const availableSaved = savedAiFiles.filter((f) =>
        availableChoices.includes(f)
      );
      if (availableSaved.length > 0) {
        const savedLabels = availableSaved
          .map((f) => aiFilePaths[f])
          .join(", ");
        const useDefault = await p.confirm({
          message: `Generate AI instruction files? ${color.dim(
            `(${savedLabels})`
          )}`,
          initialValue: true,
        });
        if (!p.isCancel(useDefault) && useDefault) {
          selectedAiFiles = availableSaved;
        }
      }
    } else {
      const aiFilesChoice = await p.multiselect({
        message: "Generate AI instruction files?",
        options: availableChoices.map((c) => ({
          value: c,
          label: aiFilePaths[c],
          hint:
            c === "cursor-rules"
              ? "Cursor AI"
              : c === "agents-md"
              ? "GitHub Copilot, general"
              : c === "claude-md"
              ? "Claude"
              : "GitHub Copilot",
        })),
        required: false,
      });
      if (!p.isCancel(aiFilesChoice) && aiFilesChoice.length > 0) {
        selectedAiFiles = aiFilesChoice as AiFileChoice[];
        const saveChoice = await p.confirm({
          message: "Save as default for future?",
          initialValue: true,
        });
        if (!p.isCancel(saveChoice) && saveChoice) {
          setAiFiles(selectedAiFiles);
        }
      }
    }

    if (selectedAiFiles.length > 0) {
      const scope = await getMonorepoScope(monorepoRoot);
      const aiFilesOutput: Record<string, { type: "text"; content: string }> =
        {};
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
    spinner.stop(color.red("✗") + " Failed to fix workspace");
    console.error(error);
    process.exit(1);
  }
}

/**
 * Handles the --workspace command for non-interactive package creation in a monorepo.
 */
async function handleWorkspaceCommand(
  name: string,
  options: CliOptions
): Promise<void> {
  const monorepoRoot = await detectMonorepoRoot();
  if (!monorepoRoot) {
    console.error(
      color.red("Error:") + " --workspace flag requires being inside a monorepo"
    );
    process.exit(1);
  }

  if (!name) {
    console.error(
      color.red("Error:") + " Package name is required with --workspace flag"
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

  const scopedName = name.startsWith("@") ? name : `@${scope}/${name}`;

  // Check if directory already exists
  const fullPackagePath = join(monorepoRoot, targetDir, name);
  try {
    await access(fullPackagePath, constants.F_OK);
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
  const formatter = inheritedTooling.formatter ?? options.formatter ?? "oxfmt";

  await Promise.all(versionPromises);

  const relativePkgPath = join(targetDir, name);
  const workspaceRoot = calculateWorkspaceRoot(relativePkgPath);

  const generateOptions: GenerateOptions = {
    name: scopedName,
    projectType,
    libraryBundler: isLibrary ? options.bundler ?? "unbuild" : undefined,
    template,
    linter,
    formatter,
    workspaceRoot,
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
    color.cyan("Creating") + ` ${scopedName} in ${targetDir}/${name}...`
  );

  try {
    const files = generate(generateOptions);
    await writeGeneratedFiles(fullPackagePath, files);

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

/**
 * Handles interactive monorepo creation.
 */
async function handleMonorepoCreation(
  generateOptions: GenerateOptions
): Promise<void> {
  const { generateMonorepo } = await import("./generators/monorepo.js");

  const packageManager = generateOptions.packageManager || "pnpm";
  if (packageManager === "pnpm") {
    generateOptions.pnpmVersion = await getLatestPnpmVersion();
  } else if (packageManager === "yarn") {
    generateOptions.yarnVersion = await getLatestYarnVersion();
  } else if (packageManager === "npm") {
    generateOptions.npmVersion = await getLatestNpmCliVersion();
  }

  const nodeVersion = generateOptions.nodeVersion ?? "latest";
  if (nodeVersion === "latest") {
    generateOptions.nodeVersion = await getLatestNodeVersion();
  }

  // Prompt for AI instruction files
  const savedAiFiles = getAiFiles();
  let selectedAiFiles: AiFileChoice[] = [];

  if (savedAiFiles && savedAiFiles.length > 0) {
    const aiFileLabels: Record<AiFileChoice, string> = {
      "cursor-rules": ".cursor/rules",
      "agents-md": "AGENTS.md",
      "claude-md": "CLAUDE.md",
      "copilot-md": ".github/copilot-instructions.md",
    };
    const savedLabels = savedAiFiles.map((f) => aiFileLabels[f]).join(", ");

    const useDefault = await p.confirm({
      message: `Generate AI instruction files? ${color.dim(
        `(${savedLabels})`
      )}`,
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
        {
          value: "agents-md",
          label: "AGENTS.md",
          hint: "GitHub Copilot, general",
        },
        { value: "claude-md", label: "CLAUDE.md", hint: "Claude" },
        {
          value: "copilot-md",
          label: ".github/copilot-instructions.md",
          hint: "GitHub Copilot",
        },
      ],
      required: false,
    });

    if (!p.isCancel(aiFilesChoice) && aiFilesChoice.length > 0) {
      selectedAiFiles = aiFilesChoice as AiFileChoice[];

      const saveChoice = await p.confirm({
        message: "Save as default for future monorepos?",
        initialValue: true,
      });

      if (!p.isCancel(saveChoice) && saveChoice) {
        setAiFiles(selectedAiFiles);
      }
    }
  }

  const projectPath = join(cwd(), generateOptions.name);
  const spinner = p.spinner();
  spinner.start("Creating monorepo workspace...");

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

    const filePaths = Object.keys(files).sort();
    for (const filePath of filePaths) {
      const fullFilePath = join(projectPath, filePath);
      await mkdir(dirname(fullFilePath), { recursive: true });
      const file = files[filePath]!;

      if (file.type === "text") {
        await writeFile(fullFilePath, file.content);
      }
    }

    spinner.stop(color.green.inverse(" ✓ Monorepo workspace created! "));

    const newMonorepoTooling: WorkspaceTooling = {
      linter: generateOptions.linter,
      formatter: generateOptions.formatter,
    };

    const scope = generateOptions.name;

    let addMore = true;
    while (addMore) {
      addMore = await createPackageInWorkspace(
        projectPath,
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

    await promptAndOpenEditor(projectPath);

    p.outro(color.green("Happy coding! ✨"));
    process.exit(0);
  } catch (error) {
    spinner.stop("Failed to create monorepo workspace");
    p.log.error(String(error));
    process.exit(1);
  }
}

/**
 * Handles standalone project creation (app or library).
 */
async function handleStandaloneProjectCreation(
  generateOptions: GenerateOptions
): Promise<void> {
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

  const packageManager = generateOptions.packageManager || "pnpm";
  if (packageManager === "pnpm") {
    generateOptions.pnpmVersion = await getLatestPnpmVersion();
  } else if (packageManager === "yarn") {
    generateOptions.yarnVersion = await getLatestYarnVersion();
  } else if (packageManager === "npm") {
    generateOptions.npmVersion = await getLatestNpmCliVersion();
  }

  const nodeVersion = generateOptions.nodeVersion ?? "latest";
  if (nodeVersion === "latest") {
    generateOptions.nodeVersion = await getLatestNodeVersion();
  }

  // Fetch latest package versions in parallel
  const versions: PackageVersions = {};
  const versionPromises: Promise<void>[] = [];

  const isLibrary = generateOptions.projectType === "library";
  const testing = generateOptions.testing ?? (isLibrary ? "vitest" : "none");
  if (testing === "vitest") {
    versionPromises.push(
      getLatestNpmVersion("vitest", "4.0.0").then((v) => {
        versions.vitest = v;
      })
    );
  }

  if (!isLibrary) {
    versionPromises.push(
      getLatestNpmVersion("vite", "6.3.4").then((v) => {
        versions.vite = v;
      })
    );
  }

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
    versionPromises.push(
      getLatestNpmVersion("@biomejs/biome", "1.9.4").then((v) => {
        versions.biome = v;
      })
    );
  }

  await Promise.all(versionPromises);
  generateOptions.versions = versions;

  const projectPath = join(cwd(), generateOptions.name);
  const spinner = p.spinner();
  spinner.start("Creating project...");

  try {
    const files = generate(generateOptions);
    await writeGeneratedFiles(projectPath, files);

    spinner.stop(color.green.inverse(" ✓ Project created! "));

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

    await promptAndOpenEditor(projectPath);

    p.outro(color.green("Happy coding! ✨"));
  } catch (error) {
    spinner.stop("Failed to create project");
    p.log.error(String(error));
    process.exit(1);
  }
}

/**
 * Handles interactive mode when inside a monorepo.
 */
async function handleInteractiveMonorepoMode(
  monorepoRoot: string
): Promise<void> {
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

    const scope = await getMonorepoScope(monorepoRoot);

    let addMore = true;
    while (addMore) {
      addMore = await createPackageInWorkspace(
        monorepoRoot,
        "pnpm",
        inheritedTooling,
        scope
      );
    }

    p.note(
      [`cd ${monorepoRoot}`, "pnpm install", "pnpm run dev"].join("\n"),
      "Next steps"
    );

    await promptAndOpenEditor(monorepoRoot);

    p.outro(color.green("Happy coding! ✨"));
    process.exit(0);
  }
  // If standalone, return to continue with normal flow
}

// =============================================================================
// Main Entry Point
// =============================================================================

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
    .option(
      "--path <directory>",
      "Run in specified directory instead of current working directory"
    )
    .action(async (name: string | undefined, options: CliOptions) => {
      // Change working directory if --path is provided
      if (options.path) {
        process.chdir(options.path);
      }

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

      // Handle flags that may have been parsed as the name argument
      if (name?.startsWith("-")) {
        switch (name) {
          case "--version":
          case "-V":
            console.log(pkg.version);
            process.exit(0);
          case "--help":
          case "-h":
            program.help();
            break;
          case "--clear-config":
            clearConfig();
            console.log("Configuration cleared.");
            process.exit(0);
          case "--config-path":
            console.log(getConfigPath());
            process.exit(0);
          case "--check":
            await handleCheckCommand();
            break;
          case "--fix":
            options.fix = true;
            break;
          default:
            console.error(color.red(`Unknown option: ${name}`));
            process.exit(1);
        }
      }

      // Handle --check flag
      if (options.check) {
        await handleCheckCommand();
      }

      // Handle --fix flag
      if (options.fix) {
        await handleFixCommand(options);
      }

      // Validate --dir requires --workspace
      if (options.dir && !options.workspace) {
        console.error(color.red("Error:") + " --dir requires --workspace flag");
        console.log(
          color.dim(
            "  Example: pnpm create krispya my-lib --workspace --dir examples"
          )
        );
        process.exit(1);
      }

      // Handle --workspace flag
      if (options.workspace) {
        await handleWorkspaceCommand(name!, options);
      }

      // Interactive mode starts here
      console.clear();
      p.intro(color.bgCyan(color.black(` create-krispya v${pkg.version} `)));

      // Check if we're inside a monorepo workspace
      const monorepoRoot = await detectMonorepoRoot();
      if (monorepoRoot && Object.keys(options).length === 0) {
        await handleInteractiveMonorepoMode(monorepoRoot);
      }

      // Get generate options (from CLI flags or prompts)
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

      // Route to appropriate handler
      if (generateOptions.projectType === "monorepo") {
        await handleMonorepoCreation(generateOptions);
      } else {
        await handleStandaloneProjectCreation(generateOptions);
      }
    });

  await program.parseAsync();
}

main().catch(console.error);
