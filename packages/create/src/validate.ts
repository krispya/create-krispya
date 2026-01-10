import { access, constants } from "fs/promises";
import { join } from "path";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

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

  // Check for linter config (oxlint package, eslint.config.js, or biome.json)
  const oxlintPath = join(monorepoRoot, ".config/oxlint/package.json");
  const eslintPath = join(monorepoRoot, "eslint.config.js");
  const biomePath = join(monorepoRoot, "biome.json");

  let hasLinter = false;
  try {
    await access(oxlintPath, constants.F_OK);
    hasLinter = true;
  } catch {
    try {
      await access(eslintPath, constants.F_OK);
      hasLinter = true;
    } catch {
      try {
        await access(biomePath, constants.F_OK);
        hasLinter = true;
      } catch {
        // No linter found
      }
    }
  }
  if (!hasLinter) {
    errors.push(
      "Missing linter config (.config/oxlint, eslint.config.js, or biome.json)"
    );
  }

  // Check for formatter config (oxfmt package, .prettierrc.json, or biome.json)
  const oxfmtPath = join(monorepoRoot, ".config/oxfmt/package.json");
  const prettierPath = join(monorepoRoot, ".prettierrc.json");

  let hasFormatter = false;
  try {
    await access(oxfmtPath, constants.F_OK);
    hasFormatter = true;
  } catch {
    try {
      await access(prettierPath, constants.F_OK);
      hasFormatter = true;
    } catch {
      try {
        await access(biomePath, constants.F_OK);
        hasFormatter = true;
      } catch {
        // No formatter found
      }
    }
  }
  if (!hasFormatter) {
    errors.push(
      "Missing formatter config (.config/oxfmt, .prettierrc.json, or biome.json)"
    );
  }

  return { valid: errors.length === 0, errors };
}
