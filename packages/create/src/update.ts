import { readFile, access, writeFile, mkdir } from "fs/promises";
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
import { generateAiFiles, type AiFilesParams } from "./generators/ai-files.js";

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

// =============================================================================
// Config Detection
// =============================================================================

/**
 * Detects the current workspace configuration from existing files.
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

  // Detect linter from devDependencies
  let linter: Linter = "oxlint";
  try {
    const pkgPath = join(root, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkgJson = JSON.parse(content) as {
      devDependencies?: Record<string, string>;
    };
    const devDeps = pkgJson.devDependencies ?? {};
    if (devDeps["@biomejs/biome"]) {
      linter = "biome";
    } else if (devDeps.eslint) {
      linter = "eslint";
    } else if (devDeps.oxlint) {
      linter = "oxlint";
    }
  } catch {
    // Default to oxlint
  }

  // Detect formatter from devDependencies
  let formatter: Formatter = "oxfmt";
  try {
    const pkgPath = join(root, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkgJson = JSON.parse(content) as {
      devDependencies?: Record<string, string>;
    };
    const devDeps = pkgJson.devDependencies ?? {};
    if (devDeps["@biomejs/biome"]) {
      formatter = "biome";
    } else if (devDeps.prettier) {
      formatter = "prettier";
    } else if (devDeps.oxfmt) {
      formatter = "oxfmt";
    }
  } catch {
    // Default to oxfmt
  }

  return {
    name,
    linter,
    formatter,
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
  const aiFiles: Record<string, File> = {};
  generateAiFiles(aiFiles, {
    name,
    packageManager,
    linter,
    formatter,
    aiFiles: ["cursor-rules", "agents-md", "claude-md", "copilot-md"],
  } as AiFilesParams);

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
  rootConfig[".gitignore"] = {
    type: "text",
    content: ["node_modules", "dist", "*.tsbuildinfo", ".DS_Store"].join("\n"),
  };
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
    "ai-files": aiFiles,
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
