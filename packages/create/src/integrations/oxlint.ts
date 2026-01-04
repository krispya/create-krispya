import { defaultLinterConfig } from "../constants.js";
import { getBaseTemplate, type Generator } from "../types.js";

export type GenerateOxlintOptions = {} | boolean;

// Helper to convert level to oxlint format
function toOxlintLevel(level: "off" | "warn" | "error"): string {
  return level;
}

export function generateOxlint(generator: Generator, options: GenerateOxlintOptions | undefined) {
  if (options == null) {
    return;
  }

  // Check if it's a React project
  const template = generator.options.template ?? "vanilla";
  const baseTemplate = getBaseTemplate(template);
  const isReact = baseTemplate === "react" || baseTemplate === "r3f";

  // Check if we're in a monorepo context (workspaceRoot is set)
  const isMonorepo = generator.options.workspaceRoot != null;

  if (isMonorepo) {
    // Use @config/oxlint package from workspace (oxlint itself is at root)
    generator.addDevDependency("@config/oxlint", "workspace:*");

    const configPath = isReact
      ? "node_modules/@config/oxlint/react.json"
      : "node_modules/@config/oxlint/base.json";

    generator.addScript("lint", `oxlint -c ${configPath}`);
    generator.addVscodeSetting("oxc.configPath", configPath);
  } else {
    // Standalone: add oxlint as devDependency
    const version = generator.versions.oxlint ?? "0.16.0";
    generator.addDevDependency("oxlint", `^${version}`);
    // Generate local config for standalone projects
    const { rules } = defaultLinterConfig;

    // Build plugins list - add react plugin for React projects
    const plugins = ["unicorn", "typescript", "oxc"];
    if (isReact) {
      plugins.push("react");
    }

    // Add oxlint config with plugins and common rules
    const oxlintConfig = {
      $schema: "../node_modules/oxlint/configuration_schema.json",
      plugins,
      rules: {
        "no-unused-vars": [
          toOxlintLevel(rules.noUnusedVars.level),
          {
            argsIgnorePattern: rules.noUnusedVars.argsIgnorePattern,
            varsIgnorePattern: rules.noUnusedVars.varsIgnorePattern,
            caughtErrorsIgnorePattern: rules.noUnusedVars.caughtErrorsIgnorePattern,
          },
        ],
        "no-useless-escape": "off",
        "no-unused-expressions": [
          toOxlintLevel(rules.noUnusedExpressions.level),
          { allowShortCircuit: rules.noUnusedExpressions.allowShortCircuit },
        ],
      },
      ignorePatterns: defaultLinterConfig.ignorePatterns,
    };

    generator.addFile(".config/oxlint.json", {
      type: "text",
      content: JSON.stringify(oxlintConfig, null, 2),
    });

    generator.addScript("lint", "oxlint -c .config/oxlint.json");
    generator.addVscodeSetting("oxc.configPath", ".config/oxlint.json");
  }

  generator.inject(
    "readme-tools",
    "[Oxlint](https://oxc.rs/docs/guide/usage/linter) - A fast linter for JavaScript and TypeScript",
  );
  generator.inject("vscode-extension-suggestion", "oxc.oxc-vscode");
  generator.addVscodeSetting("oxc.enable", true);
}
