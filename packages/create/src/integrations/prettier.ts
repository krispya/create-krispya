import { defaultFormatterConfig } from "../constants.js";
import type { Generator } from "../index.js";

export type GeneratePrettierOptions = {} | boolean;

export function generatePrettier(
  generator: Generator,
  options: GeneratePrettierOptions | undefined,
) {
  if (options == null) {
    return;
  }

  const version = generator.versions.prettier ?? "3.4.2";
  generator.addDevDependency("prettier", `^${version}`);

  // Add prettier config using common formatter settings
  const prettierConfig = {
    $schema: "https://json.schemastore.org/prettierrc",
    printWidth: defaultFormatterConfig.printWidth,
    tabWidth: defaultFormatterConfig.tabWidth,
    useTabs: defaultFormatterConfig.useTabs,
    semi: defaultFormatterConfig.semi,
    singleQuote: defaultFormatterConfig.singleQuote,
    trailingComma: defaultFormatterConfig.trailingComma,
    bracketSpacing: defaultFormatterConfig.bracketSpacing,
    arrowParens: defaultFormatterConfig.arrowParens,
  };

  generator.addFile(".prettierrc", {
    type: "text",
    content: JSON.stringify(prettierConfig, null, 2),
  });

  generator.addScript("format", "prettier --write .");
  generator.inject("readme-tools", "[Prettier](https://prettier.io/) - Opinionated code formatter");
  generator.inject("vscode-extension-suggestion", "esbenp.prettier-vscode");
  generator.addVscodeSetting("editor.defaultFormatter", "esbenp.prettier-vscode");
}
