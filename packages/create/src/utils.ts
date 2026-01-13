/**
 * Fetches the latest version of an npm package from the registry
 * @param packageName The name of the npm package
 * @param fallback Fallback version if fetch fails
 * @returns The latest version string (e.g., "1.0.0")
 */
export async function getLatestNpmVersion(
  packageName: string,
  fallback: string
): Promise<string> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${packageName}/latest`
    );
    const data = (await response.json()) as { version: string };
    return data.version;
  } catch {
    return fallback;
  }
}

/**
 * Fetches the latest version of pnpm from the npm registry
 * @returns The latest pnpm version string (e.g., "10.24.0")
 */
export async function getLatestPnpmVersion(): Promise<string> {
  return getLatestNpmVersion("pnpm", "10.11.0");
}

/**
 * Fetches the latest version of yarn from the npm registry
 * @returns The latest yarn version string (e.g., "4.6.0")
 */
export async function getLatestYarnVersion(): Promise<string> {
  return getLatestNpmVersion("yarn", "4.6.0");
}

/**
 * Fetches the latest version of npm from the npm registry
 * @returns The latest npm version string (e.g., "11.0.0")
 */
export async function getLatestNpmCliVersion(): Promise<string> {
  return getLatestNpmVersion("npm", "11.0.0");
}

/**
 * Fetches the latest LTS version of Node.js
 * @returns The latest Node.js LTS version string (e.g., "22.13.0")
 */
export async function getLatestNodeVersion(): Promise<string> {
  try {
    const response = await fetch("https://nodejs.org/dist/index.json");
    const data = (await response.json()) as Array<{
      version: string;
      lts: boolean | string;
    }>;
    // Find the first LTS version
    const ltsVersion = data.find((v) => v.lts);
    if (ltsVersion) {
      // Remove the 'v' prefix from version string
      return ltsVersion.version.replace(/^v/, "");
    }
    return "22.0.0";
  } catch {
    // Fallback to a known recent LTS version if fetch fails
    return "22.0.0";
  }
}

/**
 * Validates a single name segment (scope or package name part).
 */
function validateNameSegment(segment: string, label: string): string | undefined {
  if (!segment.length) {
    return `${label} is required`;
  }

  // Check for valid characters (lowercase alphanumeric and hyphens)
  if (!/^[a-z0-9-]+$/.test(segment)) {
    return `${label} must be lowercase and contain only letters, numbers, and hyphens`;
  }

  // Cannot start or end with hyphen
  if (segment.startsWith("-") || segment.endsWith("-")) {
    return `${label} cannot start or end with a hyphen`;
  }

  // Cannot have consecutive hyphens
  if (segment.includes("--")) {
    return `${label} cannot contain consecutive hyphens`;
  }

  return undefined;
}

/**
 * Validates a package name for use in a monorepo workspace.
 * Returns an error message if invalid, undefined if valid.
 *
 * Rules:
 * - Supports scoped names (@scope/name) or unscoped names
 * - Must be lowercase
 * - Only alphanumeric characters and hyphens allowed in each segment
 * - Cannot start or end with a hyphen
 * - Cannot contain path traversal sequences
 * - Cannot be empty
 */
export function validatePackageName(name: string): string | undefined {
  if (!name.length) {
    return "Package name is required";
  }

  // Check for path traversal attempts
  if (name.includes("..") || name.includes("\\")) {
    return "Package name cannot contain path traversal sequences";
  }

  // Handle scoped packages (@scope/name)
  if (name.startsWith("@")) {
    const slashIndex = name.indexOf("/");
    if (slashIndex === -1) {
      return "Scoped package name must include a package name after the scope (e.g., @scope/name)";
    }

    // Multiple slashes not allowed
    if (name.indexOf("/", slashIndex + 1) !== -1) {
      return "Package name can only have one slash for scoped packages";
    }

    const scope = name.slice(1, slashIndex); // Remove @ prefix
    const packageName = name.slice(slashIndex + 1);

    const scopeError = validateNameSegment(scope, "Scope");
    if (scopeError) return scopeError;

    const nameError = validateNameSegment(packageName, "Package name");
    if (nameError) return nameError;

    return undefined;
  }

  // Unscoped package - no slashes allowed
  if (name.includes("/")) {
    return "Unscoped package name cannot contain slashes. Use @scope/name format for scoped packages";
  }

  return validateNameSegment(name, "Package name");
}

/**
 * Parses pnpm-workspace.yaml content to extract workspace directory names.
 * Filters out hidden directories (starting with .).
 */
export function parseWorkspaceYamlContent(content: string): string[] {
  const directories: string[] = [];
  let inPackagesSection = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (trimmed === "packages:") {
      inPackagesSection = true;
      continue;
    }

    // Stop at next top-level key
    if (
      inPackagesSection &&
      trimmed &&
      !line.startsWith(" ") &&
      !line.startsWith("\t") &&
      !trimmed.startsWith("-")
    ) {
      break;
    }

    // Parse package entries (e.g., '  - "apps/*"', '  - ./packages/**/*')
    if (inPackagesSection && trimmed.startsWith("-")) {
      const entry = trimmed
        .slice(1) // Remove leading -
        .trim()
        .replace(/^["']|["']$/g, "") // Remove quotes
        .replace(/^\.\//, "") // Remove ./ prefix
        .replace(/\/\*.*$/, ""); // Remove /* or /**/* suffix

      // Skip hidden directories
      if (entry && !entry.startsWith(".")) {
        directories.push(entry);
      }
    }
  }

  return directories;
}

// =============================================================================
// Tooling Detection
// =============================================================================

import { access, readFile } from "fs/promises";
import { constants } from "fs";
import { join } from "path";

import type { Linter, Formatter } from "./types.js";

export type DetectedTooling = {
  linter: Linter | undefined;
  formatter: Formatter | undefined;
};

/**
 * Checks if a path exists.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects linter from scripts.lint content.
 */
function detectLinterFromScript(script: string | undefined): Linter | undefined {
  if (!script) return undefined;
  if (script.includes("oxlint")) return "oxlint";
  if (script.includes("eslint")) return "eslint";
  if (script.includes("biome check") || script.includes("biome lint")) return "biome";
  return undefined;
}

/**
 * Detects formatter from scripts.format content.
 */
function detectFormatterFromScript(script: string | undefined): Formatter | undefined {
  if (!script) return undefined;
  if (script.includes("prettier")) return "prettier";
  if (script.includes("oxfmt")) return "oxfmt";
  if (script.includes("biome format")) return "biome";
  return undefined;
}

/**
 * Detects linter from .config/ directories.
 */
async function detectLinterFromConfig(root: string): Promise<Linter | undefined> {
  if (await pathExists(join(root, ".config/oxlint"))) return "oxlint";
  if (await pathExists(join(root, ".config/eslint"))) return "eslint";
  if (await pathExists(join(root, "biome.json"))) {
    // Check if biome linter is enabled
    try {
      const content = await readFile(join(root, "biome.json"), "utf-8");
      const config = JSON.parse(content) as { linter?: { enabled?: boolean } };
      if (config.linter?.enabled !== false) return "biome";
    } catch {
      return "biome"; // Assume enabled if can't parse
    }
  }
  return undefined;
}

/**
 * Detects formatter from .config/ directories.
 */
async function detectFormatterFromConfig(root: string): Promise<Formatter | undefined> {
  if (await pathExists(join(root, ".config/prettier"))) return "prettier";
  if (await pathExists(join(root, ".config/oxfmt"))) return "oxfmt";
  if (await pathExists(join(root, "biome.json"))) {
    // Check if biome formatter is enabled
    try {
      const content = await readFile(join(root, "biome.json"), "utf-8");
      const config = JSON.parse(content) as { formatter?: { enabled?: boolean } };
      if (config.formatter?.enabled !== false) return "biome";
    } catch {
      return "biome"; // Assume enabled if can't parse
    }
  }
  return undefined;
}

/**
 * Detects linter from devDependencies.
 */
function detectLinterFromDeps(devDeps: Record<string, string> | undefined): Linter | undefined {
  if (!devDeps) return undefined;
  if (devDeps["@biomejs/biome"]) return "biome";
  if (devDeps.eslint) return "eslint";
  if (devDeps.oxlint) return "oxlint";
  return undefined;
}

/**
 * Detects formatter from devDependencies.
 */
function detectFormatterFromDeps(devDeps: Record<string, string> | undefined): Formatter | undefined {
  if (!devDeps) return undefined;
  if (devDeps["@biomejs/biome"]) return "biome";
  if (devDeps.prettier) return "prettier";
  if (devDeps.oxfmt) return "oxfmt";
  return undefined;
}

/**
 * Detects linter and formatter from a monorepo root.
 * Priority: scripts → .config/ directories → devDependencies
 */
export async function detectTooling(root: string): Promise<DetectedTooling> {
  try {
    const pkgPath = join(root, "package.json");
    const content = await readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(content) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // Detect linter: scripts → config → deps
    const linter =
      detectLinterFromScript(pkg.scripts?.lint) ??
      (await detectLinterFromConfig(root)) ??
      detectLinterFromDeps(pkg.devDependencies);

    // Detect formatter: scripts → config → deps
    const formatter =
      detectFormatterFromScript(pkg.scripts?.format) ??
      (await detectFormatterFromConfig(root)) ??
      detectFormatterFromDeps(pkg.devDependencies);

    return { linter, formatter };
  } catch {
    return { linter: undefined, formatter: undefined };
  }
}

// =============================================================================
// Name Generation
// =============================================================================

/**
 * Generates a random name in the format "adjective-noun"
 * @returns A randomly generated name string
 */
export function generateRandomName(): string {
  const adjectives = [
    "red",
    "blue",
    "green",
    "yellow",
    "purple",
    "orange",
    "pink",
    "black",
    "white",
    "tiny",
    "big",
    "small",
    "large",
    "huge",
    "giant",
    "mini",
    "mega",
    "super",
    "happy",
    "sad",
    "angry",
    "calm",
    "quiet",
    "loud",
    "silent",
    "noisy",
    "shiny",
    "dull",
    "bright",
    "dark",
    "fuzzy",
    "smooth",
    "rough",
    "soft",
  ];

  const nouns = [
    "apple",
    "banana",
    "cherry",
    "date",
    "elderberry",
    "fig",
    "grape",
    "honeydew",
    "cat",
    "dog",
    "elephant",
    "fox",
    "giraffe",
    "horse",
    "iguana",
    "jaguar",
    "mountain",
    "river",
    "ocean",
    "desert",
    "forest",
    "jungle",
    "meadow",
    "valley",
    "star",
    "moon",
    "sun",
    "planet",
    "comet",
    "asteroid",
    "galaxy",
    "universe",
  ];

  const randomAdjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

  return `${randomAdjective}-${randomNoun}`;
}
