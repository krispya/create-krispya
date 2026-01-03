import { defaultLinterConfig } from "../constants.js";
import { getBaseTemplate, getLanguageFromTemplate, type Generator } from "../types.js";

export type GenerateEslintOptions = {} | boolean;

// Helper to convert level to eslint format
function toEslintLevel(level: "off" | "warn" | "error"): string {
  return level;
}

export function generateEslint(generator: Generator, options: GenerateEslintOptions | undefined) {
  if (options == null) {
    return;
  }

  const version = generator.versions.eslint ?? "9.17.0";
  generator.addDevDependency("eslint", `^${version}`);

  // Add eslint flat config
  const template = generator.options.template ?? "vanilla";
  const baseTemplate = getBaseTemplate(template);
  const isTypescript = getLanguageFromTemplate(template) === "typescript";
  const isReact = baseTemplate === "react" || baseTemplate === "r3f";

  const { rules } = defaultLinterConfig;

  const imports: string[] = ['import js from "@eslint/js"'];
  const configs: string[] = ["js.configs.recommended"];

  if (isTypescript) {
    generator.addDevDependency("typescript-eslint", "^8.18.0");
    imports.push('import tseslint from "typescript-eslint"');
    configs.push("...tseslint.configs.recommended");
  }

  if (isReact) {
    generator.addDevDependency("eslint-plugin-react-hooks", "^5.1.0");
    imports.push('import reactHooks from "eslint-plugin-react-hooks"');
  }

  // Build ignore patterns string
  const ignoresArray = JSON.stringify(defaultLinterConfig.ignorePatterns);

  // Build rules object - use @typescript-eslint/no-unused-vars for TS projects
  const unusedVarsRule = isTypescript ? "@typescript-eslint/no-unused-vars" : "no-unused-vars";
  const rulesConfig = {
    [unusedVarsRule]: [
      toEslintLevel(rules.noUnusedVars.level),
      {
        argsIgnorePattern: rules.noUnusedVars.argsIgnorePattern,
        varsIgnorePattern: rules.noUnusedVars.varsIgnorePattern,
        caughtErrorsIgnorePattern: rules.noUnusedVars.caughtErrorsIgnorePattern,
      },
    ],
    "no-unused-expressions": [
      toEslintLevel(rules.noUnusedExpressions.level),
      { allowShortCircuit: rules.noUnusedExpressions.allowShortCircuit },
    ],
  };

  const rulesString = JSON.stringify(rulesConfig, null, 4).replace(/\n/g, "\n    ");

  const configContent = [
    ...imports,
    "",
    "export default [",
    `  { ignores: ${ignoresArray} },`,
    `  ${configs.join(",\n  ")},`,
    isReact
      ? `  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
  },`
      : "",
    `  {
    rules: ${rulesString},
  },`,
    "]",
  ]
    .filter(Boolean)
    .join("\n");

  generator.addFile("eslint.config.js", {
    type: "text",
    content: configContent,
  });

  generator.addScript("lint", "eslint .");
  generator.inject(
    "readme-tools",
    "[ESLint](https://eslint.org/) - Linter for JavaScript and TypeScript",
  );
  generator.inject("vscode-extension-suggestion", "dbaeumer.vscode-eslint");
  generator.addVscodeSetting("eslint.enable", true);
}
