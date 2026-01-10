/**
 * Fetches the latest version of an npm package from the registry
 * @param packageName The name of the npm package
 * @param fallback Fallback version if fetch fails
 * @returns The latest version string (e.g., "1.0.0")
 */
export async function getLatestNpmVersion(packageName: string, fallback: string): Promise<string> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
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
 * Fetches the latest LTS version of Node.js
 * @returns The latest Node.js LTS version string (e.g., "22.13.0")
 */
export async function getLatestNodeVersion(): Promise<string> {
  try {
    const response = await fetch("https://nodejs.org/dist/index.json");
    const data = (await response.json()) as Array<{ version: string; lts: boolean | string }>;
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
 * Validates a package name for use in a monorepo workspace.
 * Returns an error message if invalid, undefined if valid.
 *
 * Rules:
 * - Must be lowercase
 * - Only alphanumeric characters and hyphens allowed
 * - Cannot start or end with a hyphen
 * - Cannot contain path traversal sequences
 * - Cannot be empty
 */
export function validatePackageName(name: string): string | undefined {
  if (!name.length) {
    return "Package name is required";
  }

  // Check for path traversal attempts
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return "Package name cannot contain path separators or '..'";
  }

  // Check for valid characters (lowercase alphanumeric and hyphens)
  if (!/^[a-z0-9-]+$/.test(name)) {
    return "Package name must be lowercase and contain only letters, numbers, and hyphens";
  }

  // Cannot start or end with hyphen
  if (name.startsWith("-") || name.endsWith("-")) {
    return "Package name cannot start or end with a hyphen";
  }

  // Cannot have consecutive hyphens
  if (name.includes("--")) {
    return "Package name cannot contain consecutive hyphens";
  }

  return undefined;
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
    if (inPackagesSection && trimmed && !line.startsWith(" ") && !line.startsWith("\t") && !trimmed.startsWith("-")) {
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

  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

  return `${randomAdjective}-${randomNoun}`;
}
