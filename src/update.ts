import { readFile, access, writeFile, mkdir, rm, readdir } from "fs/promises";
import { constants } from "fs";
import { join, dirname } from "path";

import type { Linter, Formatter, File } from "./types.js";
import {
  generateTypescriptConfigPackage,
  generateOxlintConfigPackage,
  generateEslintConfigPackage,
  generatePrettierConfigPackage,
  generateOxfmtConfigPackage,
  generateVscodeFiles,
} from "./generators/monorepo.js";
import { generateAiFiles, ALL_AI_PLATFORMS } from "./generators/ai-files.js";
import { generateGitignore } from "./generators/gitignore.js";
import { parseWorkspaceYamlContent, detectTooling } from "./utils.js";

// =============================================================================
// Types
// =============================================================================

export type UpdateCategory =
  | "ai-files"
  | "vscode"
  | "config-packages"
  | "workspace-config"
  | "root-config";

export type FileChangeStatus = "added" | "modified" | "unchanged";

export type FileChange = {
  path: string;
  status: FileChangeStatus;
  currentContent?: string;
  newContent: string;
};

export type CategoryUpdate = {
  category: UpdateCategory;
  label: string;
  changes: FileChange[];
  hasUserModifications: boolean;
};

export type WorkspaceConfig = {
  name: string;
  linter: Linter;
  formatter: Formatter;
  packageManager: "pnpm";
};

export type MigrationTarget = {
  linter?: Linter;
  formatter?: Formatter;
};

export type MigrationChange = {
  type: "remove-dir" | "add-file" | "remove-file" | "update-package-json";
  path: string;
  description: string;
  content?: string;
};

export type MigrationPlan = {
  fromLinter: Linter;
  toLinter: Linter;
  fromFormatter: Formatter;
  toFormatter: Formatter;
  changes: MigrationChange[];
  subPackageUpdates: { path: string; remove: string[]; add: string[] }[];
};

// =============================================================================
// Config Detection
// =============================================================================

/**
 * Detects the current workspace configuration from existing files.
 * Uses scripts → .config/ directories → devDependencies priority.
 */
export async function detectCurrentConfig(
  root: string
): Promise<WorkspaceConfig> {
  // Read name from package.json or directory
  let name = root.split(/[/\\]/).pop() ?? "workspace";
  try {
    const pkgPath = join(root, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkgJson = JSON.parse(content) as { name?: string };
    if (pkgJson.name) {
      name = pkgJson.name.replace(/^@/, "").replace(/\/.*$/, "");
    }
  } catch {
    // Use directory name
  }

  // Detect linter and formatter using standardized detection
  const tooling = await detectTooling(root);

  return {
    name,
    linter: tooling.linter ?? "oxlint",
    formatter: tooling.formatter ?? "prettier",
    packageManager: "pnpm",
  };
}

// =============================================================================
// File Generation
// =============================================================================

/**
 * Generates expected files for all update categories.
 */
export function generateExpectedFiles(
  config: WorkspaceConfig
): Record<UpdateCategory, Record<string, File>> {
  const { name, linter, formatter, packageManager } = config;

  // AI Files
  const aiFilesMap: Record<string, File> = {};
  generateAiFiles(aiFilesMap, {
    name,
    packageManager,
    linter,
    formatter,
    isMonorepo: true,
    platforms: ALL_AI_PLATFORMS,
  });

  // VS Code
  const vscodeFiles: Record<string, File> = {};
  generateVscodeFiles(vscodeFiles, linter, formatter);

  // Config Packages
  const configPackages: Record<string, File> = {};
  generateTypescriptConfigPackage(configPackages);
  if (linter === "oxlint") {
    generateOxlintConfigPackage(configPackages);
  } else if (linter === "eslint") {
    generateEslintConfigPackage(configPackages);
  }
  if (formatter === "oxfmt") {
    generateOxfmtConfigPackage(configPackages);
  } else if (formatter === "prettier") {
    generatePrettierConfigPackage(configPackages);
  }

  // Workspace Config (pnpm-workspace.yaml)
  const workspaceConfig: Record<string, File> = {};
  // We'll handle this specially with merge logic

  // Root Config
  const rootConfig: Record<string, File> = {};
  rootConfig[".gitignore"] = generateGitignore("workspace-root");
  rootConfig[".gitattributes"] = {
    type: "text",
    content: `* text=auto eol=lf
*.{cmd,[cC][mM][dD]} text eol=crlf
*.{bat,[bB][aA][tT]} text eol=crlf
`,
  };

  // Biome config if using biome
  if (linter === "biome" || formatter === "biome") {
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
    rootConfig["biome.json"] = {
      type: "text",
      content: JSON.stringify(biomeConfig, null, 2),
    };
  }

  return {
    "ai-files": aiFilesMap,
    vscode: vscodeFiles,
    "config-packages": configPackages,
    "workspace-config": workspaceConfig,
    "root-config": rootConfig,
  };
}

// =============================================================================
// Comparison
// =============================================================================

/**
 * Checks if a file exists.
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
 * Compares expected files with disk and categorizes changes.
 */
export async function compareWithDisk(
  expected: Record<UpdateCategory, Record<string, File>>,
  root: string
): Promise<CategoryUpdate[]> {
  const categoryLabels: Record<UpdateCategory, string> = {
    "ai-files": "AI Files",
    vscode: "VS Code",
    "config-packages": "Config Packages",
    "workspace-config": "Workspace Config",
    "root-config": "Root Config",
  };

  const categories: CategoryUpdate[] = [];

  for (const [category, files] of Object.entries(expected) as [
    UpdateCategory,
    Record<string, File>
  ][]) {
    const changes: FileChange[] = [];

    for (const [filePath, file] of Object.entries(files)) {
      if (file.type !== "text") continue;

      const fullPath = join(root, filePath);
      const newContent = file.content;

      if (await fileExists(fullPath)) {
        const currentContent = await readFile(fullPath, "utf-8");
        if (currentContent === newContent) {
          changes.push({
            path: filePath,
            status: "unchanged",
            currentContent,
            newContent,
          });
        } else {
          changes.push({
            path: filePath,
            status: "modified",
            currentContent,
            newContent,
          });
        }
      } else {
        changes.push({
          path: filePath,
          status: "added",
          newContent,
        });
      }
    }

    // Skip empty categories
    if (changes.length === 0) continue;

    // Determine if user has modifications
    // A file is "user modified" if it exists but doesn't match what we'd generate
    const hasUserModifications = changes.some((c) => c.status === "modified");

    categories.push({
      category,
      label: categoryLabels[category],
      changes,
      hasUserModifications,
    });
  }

  return categories;
}

// =============================================================================
// Workspace Config Merge
// =============================================================================

/**
 * Generates workspace config updates using merge strategy.
 * Adds missing entries while preserving user's custom package paths.
 */
export async function getWorkspaceConfigUpdates(
  root: string
): Promise<FileChange[]> {
  const workspacePath = join(root, "pnpm-workspace.yaml");
  const changes: FileChange[] = [];

  let currentContent = "";
  let exists = false;

  try {
    currentContent = await readFile(workspacePath, "utf-8");
    exists = true;
  } catch {
    // File doesn't exist
  }

  if (!exists) {
    // Create new file with defaults
    const newContent = `manage-package-manager-versions: true

packages:
  - ".config/*"
  - "apps/*"
  - "packages/*"

onlyBuiltDependencies:
  - esbuild
`;
    changes.push({
      path: "pnpm-workspace.yaml",
      status: "added",
      newContent,
    });
    return changes;
  }

  // Check what's missing and build updated content
  let updatedContent = currentContent;
  let needsUpdate = false;

  // Check for manage-package-manager-versions
  if (!currentContent.includes("manage-package-manager-versions")) {
    updatedContent = `manage-package-manager-versions: true\n\n${updatedContent}`;
    needsUpdate = true;
  }

  // Check for onlyBuiltDependencies
  if (!currentContent.includes("onlyBuiltDependencies")) {
    updatedContent = `${updatedContent.trimEnd()}\n\nonlyBuiltDependencies:\n  - esbuild\n`;
    needsUpdate = true;
  }

  // Check for .config/* in packages
  if (
    !currentContent.includes(".config/*") &&
    !currentContent.includes('".config/*"')
  ) {
    // Insert .config/* after packages:
    const lines = updatedContent.split("\n");
    const packagesIndex = lines.findIndex((line) =>
      line.trim().startsWith("packages:")
    );
    if (packagesIndex !== -1) {
      lines.splice(packagesIndex + 1, 0, '  - ".config/*"');
      updatedContent = lines.join("\n");
      needsUpdate = true;
    }
  }

  if (needsUpdate) {
    changes.push({
      path: "pnpm-workspace.yaml",
      status: "modified",
      currentContent,
      newContent: updatedContent,
    });
  } else {
    changes.push({
      path: "pnpm-workspace.yaml",
      status: "unchanged",
      currentContent,
      newContent: currentContent,
    });
  }

  return changes;
}

// =============================================================================
// Apply Updates
// =============================================================================

/**
 * Writes file changes to disk.
 */
export async function applyUpdates(
  changes: FileChange[],
  root: string
): Promise<void> {
  for (const change of changes) {
    if (change.status === "unchanged") continue;

    const fullPath = join(root, change.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, change.newContent);
  }
}

// =============================================================================
// Display Helpers
// =============================================================================

/**
 * Formats a file change for display.
 */
export function formatFileChange(change: FileChange): string {
  const icon =
    change.status === "added" ? "+" : change.status === "modified" ? "~" : "=";
  return `  ${icon} ${change.path}`;
}

// =============================================================================
// Migration
// =============================================================================

const LINTER_DEPS: Record<Linter, string> = {
  oxlint: "oxlint",
  eslint: "eslint",
  biome: "@biomejs/biome",
};

const FORMATTER_DEPS: Record<Formatter, string> = {
  oxfmt: "oxfmt",
  prettier: "prettier",
  biome: "@biomejs/biome",
};

const LINTER_CONFIG_PACKAGES: Record<Linter, string | null> = {
  oxlint: "@config/oxlint",
  eslint: "@config/eslint",
  biome: null, // biome uses root biome.json
};

const FORMATTER_CONFIG_PACKAGES: Record<Formatter, string | null> = {
  oxfmt: "@config/oxfmt",
  prettier: "@config/prettier",
  biome: null, // biome uses root biome.json
};

/**
 * Checks if a migration is needed based on current config and target.
 */
export function needsMigration(
  current: WorkspaceConfig,
  target: MigrationTarget
): boolean {
  const linterChange = target.linter && target.linter !== current.linter;
  const formatterChange =
    target.formatter && target.formatter !== current.formatter;
  return linterChange || formatterChange || false;
}

/**
 * Generates a migration plan from current config to target.
 */
export async function getMigrationPlan(
  current: WorkspaceConfig,
  target: MigrationTarget,
  root: string
): Promise<MigrationPlan> {
  const toLinter = target.linter ?? current.linter;
  const toFormatter = target.formatter ?? current.formatter;

  const changes: MigrationChange[] = [];

  // Linter changes
  if (toLinter !== current.linter) {
    // Remove old linter config package (if not biome)
    if (current.linter !== "biome") {
      changes.push({
        type: "remove-dir",
        path: `.config/${current.linter}`,
        description: `Remove @config/${current.linter} package`,
      });
    }

    // Add new linter config package (if not biome)
    if (toLinter !== "biome") {
      const files: Record<string, File> = {};
      if (toLinter === "oxlint") {
        generateOxlintConfigPackage(files);
      } else if (toLinter === "eslint") {
        generateEslintConfigPackage(files);
      }
      for (const [path, file] of Object.entries(files)) {
        if (file.type === "text") {
          changes.push({
            type: "add-file",
            path,
            description: `Add ${path}`,
            content: file.content,
          });
        }
      }
    }

    // Handle biome.json
    if (toLinter === "biome" && toFormatter === "biome") {
      // Both switching to biome - add biome.json
      changes.push({
        type: "add-file",
        path: "biome.json",
        description: "Add biome.json config",
        content: JSON.stringify(
          {
            $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
            vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
            linter: { enabled: true, rules: { recommended: true } },
            formatter: { enabled: true },
          },
          null,
          2
        ),
      });
    } else if (toLinter === "biome" && toFormatter !== "biome") {
      // Only linter is biome
      changes.push({
        type: "add-file",
        path: "biome.json",
        description: "Add biome.json config (linter only)",
        content: JSON.stringify(
          {
            $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
            vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
            linter: { enabled: true, rules: { recommended: true } },
            formatter: { enabled: false },
          },
          null,
          2
        ),
      });
    }

    // Remove biome.json if migrating away from biome (and formatter isn't biome)
    if (
      current.linter === "biome" &&
      toLinter !== "biome" &&
      current.formatter !== "biome" &&
      toFormatter !== "biome"
    ) {
      changes.push({
        type: "remove-file",
        path: "biome.json",
        description: "Remove biome.json",
      });
    }
  }

  // Formatter changes
  if (toFormatter !== current.formatter) {
    // Remove old formatter config package (if not biome and not same as linter)
    const formatterSameAsLinter =
      (current.formatter as string) === (current.linter as string);
    if (current.formatter !== "biome" && !formatterSameAsLinter) {
      changes.push({
        type: "remove-dir",
        path: `.config/${current.formatter}`,
        description: `Remove @config/${current.formatter} package`,
      });
    }

    // Add new formatter config package (if not biome and not same as new linter)
    const newFormatterSameAsLinter =
      (toFormatter as string) === (toLinter as string);
    if (toFormatter !== "biome" && !newFormatterSameAsLinter) {
      const files: Record<string, File> = {};
      if (toFormatter === "oxfmt") {
        generateOxfmtConfigPackage(files);
      } else if (toFormatter === "prettier") {
        generatePrettierConfigPackage(files);
      }
      for (const [path, file] of Object.entries(files)) {
        if (file.type === "text") {
          changes.push({
            type: "add-file",
            path,
            description: `Add ${path}`,
            content: file.content,
          });
        }
      }
    }

    // Handle biome.json for formatter-only switch
    if (toFormatter === "biome" && toLinter !== "biome") {
      changes.push({
        type: "add-file",
        path: "biome.json",
        description: "Add biome.json config (formatter only)",
        content: JSON.stringify(
          {
            $schema: "https://biomejs.dev/schemas/1.9.4/schema.json",
            vcs: { enabled: true, clientKind: "git", useIgnoreFile: true },
            linter: { enabled: false },
            formatter: { enabled: true },
          },
          null,
          2
        ),
      });
    }

    // Remove biome.json if migrating away from biome formatter (and linter isn't biome)
    if (
      current.formatter === "biome" &&
      toFormatter !== "biome" &&
      current.linter !== "biome" &&
      toLinter !== "biome"
    ) {
      changes.push({
        type: "remove-file",
        path: "biome.json",
        description: "Remove biome.json",
      });
    }
  }

  // Root package.json update
  changes.push({
    type: "update-package-json",
    path: "package.json",
    description: "Update root package.json (devDependencies, scripts)",
  });

  // Note: VS Code settings and AI files are NOT included in migration.
  // User should run `--update` separately to update those interactively.

  // Find sub-packages that need updates
  const subPackageUpdates = await getSubPackageUpdates(
    root,
    current,
    toLinter,
    toFormatter
  );

  return {
    fromLinter: current.linter,
    toLinter,
    fromFormatter: current.formatter,
    toFormatter,
    changes,
    subPackageUpdates,
  };
}

/**
 * Finds all sub-packages and determines what devDependency updates are needed.
 */
async function getSubPackageUpdates(
  root: string,
  current: WorkspaceConfig,
  toLinter: Linter,
  toFormatter: Formatter
): Promise<MigrationPlan["subPackageUpdates"]> {
  const updates: MigrationPlan["subPackageUpdates"] = [];

  // Parse pnpm-workspace.yaml to find package directories
  const workspacePath = join(root, "pnpm-workspace.yaml");
  let workspaceContent: string;
  try {
    workspaceContent = await readFile(workspacePath, "utf-8");
  } catch {
    return updates;
  }

  const packageGlobs = parseWorkspaceYamlContent(workspaceContent);

  // Find actual package directories
  for (const glob of packageGlobs) {
    // Skip .config - we handle those separately
    if (glob.includes(".config")) continue;

    // Handle simple globs like "apps/*" or "packages/*"
    const baseDir = glob.replace(/\/\*$/, "").replace(/^["']|["']$/g, "");
    const basePath = join(root, baseDir);

    try {
      const entries = await readdir(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pkgJsonPath = join(basePath, entry.name, "package.json");
        try {
          const content = await readFile(pkgJsonPath, "utf-8");
          const pkg = JSON.parse(content) as {
            devDependencies?: Record<string, string>;
          };
          const devDeps = pkg.devDependencies ?? {};

          const remove: string[] = [];
          const add: string[] = [];

          // Check linter config package
          const oldLinterPkg = LINTER_CONFIG_PACKAGES[current.linter];
          const newLinterPkg = LINTER_CONFIG_PACKAGES[toLinter];
          if (
            oldLinterPkg &&
            oldLinterPkg !== newLinterPkg &&
            devDeps[oldLinterPkg]
          ) {
            remove.push(oldLinterPkg);
          }
          if (
            newLinterPkg &&
            newLinterPkg !== oldLinterPkg &&
            oldLinterPkg &&
            devDeps[oldLinterPkg]
          ) {
            add.push(newLinterPkg);
          }

          // Check formatter config package (skip if same as linter - e.g. both biome)
          if (current.formatter !== current.linter) {
            const oldFormatterPkg =
              FORMATTER_CONFIG_PACKAGES[current.formatter];
            const newFormatterPkg = FORMATTER_CONFIG_PACKAGES[toFormatter];
            if (
              oldFormatterPkg &&
              oldFormatterPkg !== newFormatterPkg &&
              devDeps[oldFormatterPkg]
            ) {
              remove.push(oldFormatterPkg);
            }
            if (
              newFormatterPkg &&
              newFormatterPkg !== oldFormatterPkg &&
              oldFormatterPkg &&
              devDeps[oldFormatterPkg]
            ) {
              add.push(newFormatterPkg);
            }
          }

          if (remove.length > 0 || add.length > 0) {
            updates.push({
              path: join(baseDir, entry.name, "package.json"),
              remove,
              add,
            });
          }
        } catch {
          // Not a package or can't read
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return updates;
}

/**
 * Applies a migration plan.
 */
export async function applyMigration(
  plan: MigrationPlan,
  root: string
): Promise<void> {
  // 1. Remove directories first
  for (const change of plan.changes) {
    if (change.type === "remove-dir") {
      const fullPath = join(root, change.path);
      try {
        await rm(fullPath, { recursive: true });
      } catch {
        // Already removed or doesn't exist
      }
    }
  }

  // 2. Remove files
  for (const change of plan.changes) {
    if (change.type === "remove-file") {
      const fullPath = join(root, change.path);
      try {
        await rm(fullPath);
      } catch {
        // Already removed or doesn't exist
      }
    }
  }

  // 3. Add/update files
  for (const change of plan.changes) {
    if (change.type === "add-file" && change.content) {
      const fullPath = join(root, change.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, change.content);
    }
  }

  // 4. Update root package.json
  await updateRootPackageJson(root, plan);

  // 5. Update sub-packages
  for (const update of plan.subPackageUpdates) {
    await updateSubPackageJson(root, update);
  }
}

/**
 * Updates the root package.json with new devDependencies and scripts.
 */
async function updateRootPackageJson(
  root: string,
  plan: MigrationPlan
): Promise<void> {
  const pkgPath = join(root, "package.json");
  const content = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(content) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const devDeps = pkg.devDependencies ?? {};

  // Remove old linter dep
  const oldLinterDep = LINTER_DEPS[plan.fromLinter];
  delete devDeps[oldLinterDep];

  // Remove old formatter dep (if different from linter)
  if (plan.fromFormatter !== plan.fromLinter) {
    const oldFormatterDep = FORMATTER_DEPS[plan.fromFormatter];
    delete devDeps[oldFormatterDep];
  }

  // Add new linter dep
  const newLinterDep = LINTER_DEPS[plan.toLinter];
  if (plan.toLinter === "oxlint") {
    devDeps[newLinterDep] = "^1.36.0";
  } else if (plan.toLinter === "eslint") {
    devDeps[newLinterDep] = "^9.17.0";
  } else if (plan.toLinter === "biome") {
    devDeps[newLinterDep] = "^1.9.4";
  }

  // Add new formatter dep (if different from linter)
  if (plan.toFormatter !== plan.toLinter) {
    const newFormatterDep = FORMATTER_DEPS[plan.toFormatter];
    if (plan.toFormatter === "oxfmt") {
      devDeps[newFormatterDep] = "^0.21.0";
    } else if (plan.toFormatter === "prettier") {
      devDeps[newFormatterDep] = "^3.4.2";
    } else if (plan.toFormatter === "biome") {
      devDeps[newFormatterDep] = "^1.9.4";
    }
  }

  pkg.devDependencies = Object.fromEntries(
    Object.entries(devDeps).sort(([a], [b]) => a.localeCompare(b))
  );

  // Update scripts
  const scripts = pkg.scripts ?? {};
  if (plan.toLinter === "oxlint") {
    scripts.lint = "oxlint .";
  } else if (plan.toLinter === "eslint") {
    scripts.lint = "eslint .";
  } else if (plan.toLinter === "biome") {
    scripts.lint = "biome check .";
  }

  if (plan.toFormatter === "oxfmt") {
    scripts.format = "oxfmt .";
  } else if (plan.toFormatter === "prettier") {
    scripts.format = "prettier --write .";
  } else if (plan.toFormatter === "biome") {
    scripts.format = "biome format . --write";
  }

  pkg.scripts = scripts;

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

/**
 * Updates a sub-package's package.json devDependencies.
 */
async function updateSubPackageJson(
  root: string,
  update: MigrationPlan["subPackageUpdates"][0]
): Promise<void> {
  const pkgPath = join(root, update.path);
  const content = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(content) as {
    devDependencies?: Record<string, string>;
  };

  const devDeps = pkg.devDependencies ?? {};

  // Remove old deps
  for (const dep of update.remove) {
    delete devDeps[dep];
  }

  // Add new deps
  for (const dep of update.add) {
    devDeps[dep] = "workspace:*";
  }

  pkg.devDependencies = Object.fromEntries(
    Object.entries(devDeps).sort(([a], [b]) => a.localeCompare(b))
  );

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

/**
 * Formats a migration change for display.
 */
export function formatMigrationChange(change: MigrationChange): string {
  const icon =
    change.type === "remove-dir" || change.type === "remove-file"
      ? "-"
      : change.type === "add-file"
      ? "+"
      : "~";
  return `  ${icon} ${change.description}`;
}
