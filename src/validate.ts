import { access, constants } from "fs/promises";
import { join } from "path";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Checks if any of the given paths exist.
 */
async function checkAnyExists(paths: string[]): Promise<boolean> {
  for (const path of paths) {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      // Continue checking
    }
  }
  return false;
}

/**
 * Validates that a monorepo workspace has all required config packages.
 */
export async function validateWorkspace(
  monorepoRoot: string
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Check for @config/typescript
  const tsConfigPath = join(monorepoRoot, ".config/typescript/package.json");
  try {
    await access(tsConfigPath, constants.F_OK);
  } catch {
    errors.push("Missing .config/typescript package");
  }

  // Check for linter config
  const linterPaths = [
    join(monorepoRoot, ".config/oxlint/package.json"),
    join(monorepoRoot, ".config/eslint/package.json"),
    join(monorepoRoot, "eslint.config.js"),
    join(monorepoRoot, "biome.json"),
  ];

  const hasLinter = await checkAnyExists(linterPaths);
  if (!hasLinter) {
    errors.push(
      "Missing linter config (.config/oxlint, .config/eslint, eslint.config.js, or biome.json)"
    );
  }

  // Check for formatter config
  const formatterPaths = [
    join(monorepoRoot, ".config/oxfmt/package.json"),
    join(monorepoRoot, ".config/prettier/package.json"),
    join(monorepoRoot, ".prettierrc.json"),
    join(monorepoRoot, "biome.json"),
  ];

  const hasFormatter = await checkAnyExists(formatterPaths);
  if (!hasFormatter) {
    errors.push(
      "Missing formatter config (.config/oxfmt, .config/prettier, .prettierrc.json, or biome.json)"
    );
  }

  return { valid: errors.length === 0, errors };
}
