import { defaultLinterConfig } from "../constants.js";
import { getBaseTemplate, type Generator } from "../index.js";

export type GenerateOxlintOptions = {} | boolean;

// Helper to convert level to oxlint format
function toOxlintLevel(level: "off" | "warn" | "error"): string {
  return level;
}

export function generateOxlint(generator: Generator, options: GenerateOxlintOptions | undefined) {
  if (options == null) {
    return;
  }

  const version = generator.versions.oxlint ?? "0.16.0";
  generator.addDependency("oxlint", `^${version}`);

  const { rules } = defaultLinterConfig;

  // Check if it's a React project
  const template = generator.options.template ?? "vanilla";
  const baseTemplate = getBaseTemplate(template);
  const isReact = baseTemplate === "react" || baseTemplate === "r3f";

  // Build plugins list - add react plugin for React projects
  const plugins = ["unicorn", "typescript", "oxc"];
  if (isReact) {
    plugins.push("react");
  }

  // Add oxlint config with plugins and common rules
  const oxlintConfig = {
    $schema: "./node_modules/oxlint/configuration_schema.json",
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

  generator.addFile("oxlint.json", {
    type: "text",
    content: JSON.stringify(oxlintConfig, null, 2),
  });

  generator.addScript("lint", "oxlint");
  generator.inject(
    "readme-tools",
    "[Oxlint](https://oxc.rs/docs/guide/usage/linter) - A fast linter for JavaScript and TypeScript",
  );
  generator.inject("vscode-extension-suggestion", "oxc.oxc-vscode");
  generator.addVscodeSetting("oxc.enable", true);
}
