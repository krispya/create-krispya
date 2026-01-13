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

import type { Linter, Formatter } from "./types.js";

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
  detectTooling,
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
import {
  detectCurrentConfig,
  generateExpectedFiles,
  compareWithDisk,
  getWorkspaceConfigUpdates,
  applyUpdates,
  formatFileChange,
  needsMigration,
  getMigrationPlan,
  applyMigration,
  formatMigrationChange,
  type CategoryUpdate,
  type MigrationTarget,
} from "./update.js";

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
  update?: boolean;
  yes?: boolean;
  workspace?: boolean;
  path?: string;
}

type InheritedWorkspaceSettings = {
  linter?: "oxlint" | "eslint" | "biome";
  formatter?: "oxfmt" | "prettier" | "biome";
  packageManager?: string;
  nodeVersion?: string;
  pnpmManageVersions?: boolean;
};

interface ExistingConfigs {
  linter?: "oxlint" | "eslint" | "biome";
  formatter?: "prettier" | "biome";
  eslintConfigPath?: string;
  prettierConfigPath?: string;
  biomeConfigPath?: string;
}

// =============================================================================
// Constants
// =============================================================================

const AI_FILE_PATHS: Record<AiFileChoice, string> = {
  "cursor-rules": ".cursor/rules",
  "agents-md": "AGENTS.md",
  "claude-md": "CLAUDE.md",
  "copilot-md": ".github/copilot-instructions.md",
};

const AI_FILE_HINTS: Record<AiFileChoice, string> = {
  "cursor-rules": "Cursor AI",
  "agents-md": "GitHub Copilot, general",
  "claude-md": "Claude",
  "copilot-md": "GitHub Copilot",
};

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
 * Prompts user to select AI instruction files.
 * Handles saved preferences, non-interactive mode, and fresh selection.
 *
 * @param availableChoices - AI file choices that don't already exist
 * @param isNonInteractive - Skip prompts and use saved/default
 * @returns Selected AI file choices
 */
async function promptForAiFileSelection(
  availableChoices: AiFileChoice[],
  isNonInteractive: boolean
): Promise<AiFileChoice[]> {
  if (availableChoices.length === 0) {
    return [];
  }

  const savedAiFiles = getAiFiles();

  // Non-interactive: use saved preference or default to cursor-rules
  if (isNonInteractive) {
    const preferred = savedAiFiles ?? ["cursor-rules"];
    return preferred.filter((f) => availableChoices.includes(f));
  }

  // Has saved preference: confirm to use it
  if (savedAiFiles && savedAiFiles.length > 0) {
    const availableSaved = savedAiFiles.filter((f) =>
      availableChoices.includes(f)
    );
    if (availableSaved.length > 0) {
      const savedLabels = availableSaved
        .map((f) => AI_FILE_PATHS[f])
        .join(", ");
      const useDefault = await p.confirm({
        message: `Generate AI instruction files? ${color.dim(
          `(${savedLabels})`
        )}`,
        initialValue: true,
      });
      if (!p.isCancel(useDefault) && useDefault) {
        return availableSaved;
      }
      return [];
    }
  }

  // No saved preference: multiselect
  const aiFilesChoice = await p.multiselect({
    message: "Which AI instruction files?",
    options: availableChoices.map((c) => ({
      value: c,
      label: AI_FILE_PATHS[c],
      hint: AI_FILE_HINTS[c],
    })),
    required: false,
  });

  if (p.isCancel(aiFilesChoice) || aiFilesChoice.length === 0) {
    return [];
  }

  const selected = aiFilesChoice as AiFileChoice[];

  // Offer to save as default
  const saveChoice = await p.confirm({
    message: "Save as default for future?",
    initialValue: true,
  });
  if (!p.isCancel(saveChoice) && saveChoice) {
    setAiFiles(selected);
  }

  return selected;
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
 * Detects workspace-level settings from the monorepo root.
 * Uses standardized detection: scripts → .config/ directories → devDependencies
 */
async function detectWorkspaceSettings(
  monorepoRoot: string
): Promise<InheritedWorkspaceSettings> {
  try {
    // Use standardized tooling detection
    const tooling = await detectTooling(monorepoRoot);

    const pkgPath = join(monorepoRoot, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkgJson = JSON.parse(content) as {
      packageManager?: string;
      engines?: { node?: string };
    };

    // Extract package manager from packageManager field (e.g., "pnpm@9.15.4")
    let packageManager: string | undefined;
    if (pkgJson.packageManager) {
      packageManager = pkgJson.packageManager.split("@")[0];
    }

    // Extract node version from engines.node (e.g., ">=22.0.0" -> "22")
    let nodeVersion: string | undefined;
    if (pkgJson.engines?.node) {
      const match = pkgJson.engines.node.match(/(\d+)/);
      if (match) {
        nodeVersion = match[1];
      }
    }

    // Check pnpm-workspace.yaml for manage-package-manager-versions
    let pnpmManageVersions: boolean | undefined;
    try {
      const workspaceFile = join(monorepoRoot, "pnpm-workspace.yaml");
      const workspaceContent = await readFile(workspaceFile, "utf-8");
      pnpmManageVersions = workspaceContent.includes(
        "manage-package-manager-versions: true"
      );
    } catch {
      // pnpm-workspace.yaml doesn't exist or can't be read
    }

    return {
      linter: tooling.linter,
      formatter: tooling.formatter,
      packageManager,
      nodeVersion,
      pnpmManageVersions,
    };
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
 * Scans the packages/ directory for existing workspace package names.
 */
async function getWorkspacePackages(monorepoRoot: string): Promise<string[]> {
  const packagesDir = join(monorepoRoot, "packages");

  try {
    const { readdir } = await import("fs/promises");
    const entries = await readdir(packagesDir, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const content = await readFile(
          join(packagesDir, entry.name, "package.json"),
          "utf-8"
        );
        const pkg = JSON.parse(content) as { name?: string };
        if (pkg.name) names.push(pkg.name);
      } catch {
        // No package.json or invalid, skip
      }
    }

    return names;
  } catch {
    return [];
  }
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
  inheritedSettings: InheritedWorkspaceSettings,
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
    initialValue: `@${scope}/`,
    validate: (value) => {
      const validationError = validatePackageName(value);
      if (validationError) return validationError;

      // Extract directory name from package name (last part after @scope/ or full name)
      const dirName = value.includes("/") ? value.split("/").pop()! : value;
      if (!dirName) return "Package name is required";

      if (!hasCustomDirectories) {
        const targetPath = join(monorepoRoot, defaultDir, dirName);
        try {
          const { statSync } = require("fs");
          statSync(targetPath);
          return `Directory ${defaultDir}/${dirName} already exists`;
        } catch {
          // Directory doesn't exist, which is what we want
        }
      }
    },
  });

  if (p.isCancel(packageNameInput)) {
    return false;
  }

  const scopedName = packageNameInput as string;
  // Extract directory name from package name (last part after @scope/ or full name)
  const shortName = scopedName.includes("/")
    ? scopedName.split("/").pop()!
    : scopedName;

  const packageOptions = await promptForPackageOptions(
    scopedName,
    packageType,
    inheritedSettings
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
  const workspacePackages =
    packageType === "app" ? await getWorkspacePackages(monorepoRoot) : [];
  if (workspacePackages.length > 0) {
    const selectedDeps = await p.multiselect({
      message: "Add workspace dependencies?",
      options: workspacePackages.map((name) => ({ value: name, label: name })),
      required: false,
    });

    if (!p.isCancel(selectedDeps) && selectedDeps.length > 0) {
      packageOptions.workspaceDependencies = selectedDeps as string[];
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

  const tooling = await detectWorkspaceSettings(monorepoRoot);
  const existingConfigs = await detectExistingConfigs(monorepoRoot);
  const detectedLinter = tooling.linter ?? existingConfigs.linter ?? "oxlint";
  const detectedFormatter =
    tooling.formatter ?? existingConfigs.formatter ?? "oxfmt";

  const isNonInteractive = Boolean(options.linter && options.formatter);

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
    const existingAiFiles: AiFileChoice[] = [];
    for (const [choice, path] of Object.entries(AI_FILE_PATHS)) {
      if (await fileExists(join(monorepoRoot, path))) {
        existingAiFiles.push(choice as AiFileChoice);
      }
    }

    const availableAiChoices: AiFileChoice[] = (
      ["cursor-rules", "agents-md", "claude-md", "copilot-md"] as AiFileChoice[]
    ).filter((c) => !existingAiFiles.includes(c));

    const selectedAiFiles = await promptForAiFileSelection(
      availableAiChoices,
      isNonInteractive
    );

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
 * Handles migration from one linter/formatter to another.
 */
async function handleMigration(
  config: {
    name: string;
    linter: Linter;
    formatter: Formatter;
    packageManager: "pnpm";
  },
  target: MigrationTarget,
  root: string,
  options: CliOptions
): Promise<void> {
  const plan = await getMigrationPlan(config, target, root);

  // Display migration summary
  console.log(color.cyan("Migration:"));
  if (plan.fromLinter !== plan.toLinter) {
    console.log(
      `  Linter: ${color.dim(plan.fromLinter)} → ${color.green(plan.toLinter)}`
    );
  }
  if (plan.fromFormatter !== plan.toFormatter) {
    console.log(
      `  Formatter: ${color.dim(plan.fromFormatter)} → ${color.green(
        plan.toFormatter
      )}`
    );
  }
  console.log();

  // Display changes
  console.log(color.cyan("Changes:"));
  for (const change of plan.changes) {
    console.log(formatMigrationChange(change));
  }

  if (plan.subPackageUpdates.length > 0) {
    console.log();
    console.log(color.cyan(`Sub-packages (${plan.subPackageUpdates.length}):`));
    for (const update of plan.subPackageUpdates) {
      const changes = [
        ...update.remove.map((d) => `-${d}`),
        ...update.add.map((d) => `+${d}`),
      ].join(", ");
      console.log(`  ~ ${update.path} (${changes})`);
    }
  }
  console.log();

  // Confirm
  if (!options.yes) {
    const confirm = await p.confirm({
      message: "Apply migration?",
      initialValue: true,
    });

    if (p.isCancel(confirm) || !confirm) {
      console.log(color.dim("  Migration cancelled"));
      process.exit(0);
    }
  }

  // Apply migration
  await applyMigration(plan, root);

  console.log();
  console.log(
    color.green("✓") + ` Migrated to ${plan.toLinter}/${plan.toFormatter}`
  );
  console.log(color.dim("  Run `pnpm install` to update dependencies"));
  console.log(
    color.dim("  Run `--update` again to update VS Code settings and AI files")
  );
  process.exit(0);
}

/**
 * Handles the --update command to update a monorepo workspace to latest configuration.
 */
async function handleUpdateCommand(options: CliOptions): Promise<void> {
  const monorepoRoot = await detectMonorepoRoot();
  if (!monorepoRoot) {
    console.log(color.red("✗") + " Not a monorepo workspace");
    console.log(color.dim("  --update only supports pnpm monorepos"));
    process.exit(1);
  }

  // Step 1: Validate workspace
  const { valid, errors } = await validateWorkspace(monorepoRoot);
  if (!valid) {
    console.log(color.yellow("!") + " Workspace has issues:");
    for (const error of errors) {
      console.log(color.dim(`  • ${error}`));
    }
    console.log();

    const shouldFix =
      options.yes ||
      (await p.confirm({
        message: "Run fix first to resolve these issues?",
        initialValue: true,
      }));

    if (p.isCancel(shouldFix) || !shouldFix) {
      console.log(
        color.dim("  Run `pnpm create krispya --fix` to fix manually")
      );
      process.exit(1);
    }

    // Detect config before fix so we can pass linter/formatter for non-interactive mode
    const preFixConfig = await detectCurrentConfig(monorepoRoot);

    // Run fix command with detected linter/formatter for non-interactive mode
    const fixOptions: CliOptions = {
      ...options,
      linter: options.linter ?? preFixConfig.linter,
      formatter: options.formatter ?? preFixConfig.formatter,
    };
    await handleFixCommand(fixOptions);
  }

  // Step 2: Detect current configuration
  const config = await detectCurrentConfig(monorepoRoot);

  // Step 3: Check for migration (if --linter or --formatter flags provided)
  const targetLinter = options.linter as Linter | undefined;
  const targetFormatter = options.formatter as Formatter | undefined;
  const migrationTarget = { linter: targetLinter, formatter: targetFormatter };

  if (needsMigration(config, migrationTarget)) {
    await handleMigration(config, migrationTarget, monorepoRoot, options);
    return;
  }

  console.log(
    color.cyan("Checking for updates...") +
      color.dim(` (${config.linter}/${config.formatter})`)
  );
  console.log();

  // Step 4: Generate expected files and compare
  const expected = generateExpectedFiles(config);
  const categories = await compareWithDisk(expected, monorepoRoot);

  // Step 4: Add workspace config updates (merge strategy)
  const workspaceConfigChanges = await getWorkspaceConfigUpdates(monorepoRoot);
  const workspaceCategory: CategoryUpdate = {
    category: "workspace-config",
    label: "Workspace Config",
    changes: workspaceConfigChanges,
    hasUserModifications: workspaceConfigChanges.some(
      (c) => c.status === "modified"
    ),
  };

  // Insert workspace config into categories
  const allCategories = categories.filter(
    (c) => c.category !== "workspace-config"
  );
  if (workspaceConfigChanges.length > 0) {
    // Insert after config-packages
    const configPkgIndex = allCategories.findIndex(
      (c) => c.category === "config-packages"
    );
    if (configPkgIndex !== -1) {
      allCategories.splice(configPkgIndex + 1, 0, workspaceCategory);
    } else {
      allCategories.push(workspaceCategory);
    }
  }

  // Step 5: Process each category
  let updatedCount = 0;
  let skippedCount = 0;

  for (const category of allCategories) {
    const newChanges = category.changes.filter((c) => c.status === "added");
    const modifiedChanges = category.changes.filter(
      (c) => c.status === "modified"
    );
    const hasNew = newChanges.length > 0;
    const hasModified = modifiedChanges.length > 0;
    const hasChanges = hasNew || hasModified;

    if (!hasChanges) {
      console.log(color.green("✓") + ` ${category.label}: Up to date`);
      continue;
    }

    // Special handling for AI Files: prompt for selection
    if (category.category === "ai-files") {
      const missingAiFiles = newChanges
        .map((c) => {
          const entry = Object.entries(AI_FILE_PATHS).find(
            ([, path]) => path === c.path
          );
          return entry ? (entry[0] as AiFileChoice) : null;
        })
        .filter((c): c is AiFileChoice => c !== null);

      if (missingAiFiles.length > 0) {
        console.log(color.cyan(category.label + ":"));
        console.log(
          color.dim(`  ${missingAiFiles.length} AI file(s) can be added`)
        );
        console.log();

        const selectedAiFiles = await promptForAiFileSelection(
          missingAiFiles,
          options.yes ?? false
        );

        if (selectedAiFiles.length > 0) {
          // Only apply selected AI files
          const selectedPaths = selectedAiFiles.map((f) => AI_FILE_PATHS[f]);
          const changesToApply = category.changes.filter((c) =>
            selectedPaths.includes(c.path)
          );
          await applyUpdates(changesToApply, monorepoRoot);
          console.log(
            color.green("✓") + ` Added ${selectedAiFiles.length} AI file(s)`
          );
          updatedCount++;
        } else {
          console.log(color.dim(`  Skipped ${category.label}`));
          skippedCount++;
        }
      }

      // Handle modified AI files separately (if any exist and changed)
      if (hasModified) {
        console.log(color.cyan("AI Files (existing):"));
        for (const change of modifiedChanges) {
          console.log(formatFileChange(change));
        }
        console.log();

        // In --yes mode, skip updating existing AI files (safe default)
        if (options.yes) {
          console.log(color.dim("  (--yes mode: keeping existing AI files)"));
        } else {
          const updateExisting = await p.confirm({
            message: "Update existing AI files to latest template?",
            initialValue: false,
          });

          if (!p.isCancel(updateExisting) && updateExisting) {
            await applyUpdates(modifiedChanges, monorepoRoot);
            console.log(color.green("✓") + " Updated existing AI files");
          }
        }
      }
      console.log();
      continue;
    }

    // Determine action based on what changes exist
    let changesToApply: typeof category.changes = [];

    if (options.yes) {
      // Show changes for --yes mode
      console.log(color.cyan(category.label + ":"));
      for (const change of [...newChanges, ...modifiedChanges]) {
        console.log(formatFileChange(change));
      }
      console.log();

      // Non-interactive: add new only (safe default)
      // Exception: workspace-config uses merge strategy, so "modified" is safe
      if (category.category === "workspace-config") {
        changesToApply = [...newChanges, ...modifiedChanges];
        if (changesToApply.length > 0) {
          console.log(color.dim("  (--yes mode: applying merge updates)"));
        }
      } else {
        changesToApply = newChanges;
        if (newChanges.length > 0) {
          console.log(color.dim("  (--yes mode: adding new files only)"));
        }
      }
    } else if (hasNew && hasModified) {
      // Both new and modified: multiselect with individual files
      // New files pre-selected, modified files not selected by default
      const allChanges = [...newChanges, ...modifiedChanges];
      const selectedFiles = await p.multiselect({
        message: `${category.label} (+ new, ~ changed)`,
        options: allChanges.map((change) => ({
          value: change.path,
          label:
            change.status === "added" ? `+ ${change.path}` : `~ ${change.path}`,
        })),
        initialValues: newChanges.map((c) => c.path), // Pre-select new files
        required: false,
      });

      if (p.isCancel(selectedFiles)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      if (selectedFiles.length > 0) {
        changesToApply = allChanges.filter((c) =>
          selectedFiles.includes(c.path)
        );
      }
    } else if (hasNew) {
      // Only new files: show list then confirm
      console.log(color.cyan(category.label + ":"));
      for (const change of newChanges) {
        console.log(formatFileChange(change));
      }
      console.log();
      // Only new files: simple confirm
      const shouldAdd = await p.confirm({
        message: `Add ${newChanges.length} new file(s)?`,
        initialValue: true,
      });

      if (p.isCancel(shouldAdd)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      if (shouldAdd) {
        changesToApply = newChanges;
      }
    } else if (hasModified) {
      // Only modified files: show list then confirm with warning
      console.log(color.cyan(category.label + ":"));
      for (const change of modifiedChanges) {
        console.log(formatFileChange(change));
      }
      console.log();

      const shouldUpdate = await p.confirm({
        message: `Update ${modifiedChanges.length} file(s)? (will overwrite)`,
        initialValue: false,
      });

      if (p.isCancel(shouldUpdate)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }

      if (shouldUpdate) {
        changesToApply = modifiedChanges;
      }
    }

    if (changesToApply.length > 0) {
      await applyUpdates(changesToApply, monorepoRoot);
      const addedCount = changesToApply.filter(
        (c) => c.status === "added"
      ).length;
      const updatedFilesCount = changesToApply.filter(
        (c) => c.status === "modified"
      ).length;
      const parts = [];
      if (addedCount > 0) parts.push(`added ${addedCount}`);
      if (updatedFilesCount > 0) parts.push(`updated ${updatedFilesCount}`);
      console.log(color.green("✓") + ` ${category.label}: ${parts.join(", ")}`);
      updatedCount++;
    } else {
      console.log(color.dim(`  Skipped ${category.label}`));
      skippedCount++;
    }
    console.log();
  }

  // Summary
  if (updatedCount === 0 && skippedCount === 0) {
    console.log(color.green("✓") + " Everything is up to date!");
  } else if (updatedCount > 0) {
    console.log(
      color.green("✓") +
        ` Updated ${updatedCount} ${
          updatedCount === 1 ? "category" : "categories"
        }`
    );
    if (skippedCount > 0) {
      console.log(color.dim(`  Skipped ${skippedCount}`));
    }
  }

  process.exit(0);
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
  const inheritedSettings = await detectWorkspaceSettings(monorepoRoot);
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

  const linter = inheritedSettings.linter ?? options.linter ?? "oxlint";
  const formatter = inheritedSettings.formatter ?? options.formatter ?? "oxfmt";
  const packageManager = inheritedSettings.packageManager ?? "pnpm";
  const nodeVersion = inheritedSettings.nodeVersion ?? "latest";
  const pnpmManageVersions = inheritedSettings.pnpmManageVersions ?? true;

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
    packageManager,
    nodeVersion,
    pnpmManageVersions,
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

  // Prompt for AI instruction files (all choices available for new monorepo)
  const allAiChoices: AiFileChoice[] = [
    "cursor-rules",
    "agents-md",
    "claude-md",
    "copilot-md",
  ];
  const selectedAiFiles = await promptForAiFileSelection(allAiChoices, false);

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

    const newWorkspaceSettings: InheritedWorkspaceSettings = {
      linter: generateOptions.linter,
      formatter: generateOptions.formatter,
      packageManager,
      nodeVersion: generateOptions.nodeVersion,
      pnpmManageVersions: generateOptions.pnpmManageVersions,
    };

    const scope = generateOptions.name;

    let addMore = true;
    while (addMore) {
      addMore = await createPackageInWorkspace(
        projectPath,
        packageManager,
        newWorkspaceSettings,
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
    const inheritedSettings = await detectWorkspaceSettings(monorepoRoot);
    const hasSettings = Object.values(inheritedSettings).some(Boolean);
    if (hasSettings) {
      const settingsInfo = [
        inheritedSettings.linter && `linter: ${inheritedSettings.linter}`,
        inheritedSettings.formatter &&
          `formatter: ${inheritedSettings.formatter}`,
        inheritedSettings.packageManager &&
          `pm: ${inheritedSettings.packageManager}`,
      ]
        .filter(Boolean)
        .join(", ");
      p.log.info(`Using workspace settings (${settingsInfo})`);
    }

    const scope = await getMonorepoScope(monorepoRoot);

    let addMore = true;
    while (addMore) {
      addMore = await createPackageInWorkspace(
        monorepoRoot,
        inheritedSettings.packageManager ?? "pnpm",
        inheritedSettings,
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
    .option("--update", "Update monorepo workspace to latest configuration")
    .option("-y, --yes", "Non-interactive mode - accept all prompts")
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
          case "--update":
            options.update = true;
            break;
          case "--yes":
            options.yes = true;
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

      // Handle --update flag
      if (options.update) {
        await handleUpdateCommand(options);
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
