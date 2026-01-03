import { defaultFormatterConfig } from "../constants.js";
import type { Generator } from "../types.js";

export type GenerateOxfmtOptions = {} | boolean;

export function generateOxfmt(
  generator: Generator,
  options: GenerateOxfmtOptions | undefined
) {
  if (options == null) {
    return;
  }

  const version = generator.versions.oxfmt ?? "0.1.0";
  generator.addDevDependency("oxfmt", `^${version}`);

  // Add oxfmt config using common formatter settings (Prettier-compatible format)
  const oxfmtConfig = {
    printWidth: defaultFormatterConfig.printWidth,
    tabWidth: defaultFormatterConfig.tabWidth,
    useTabs: defaultFormatterConfig.useTabs,
    semi: defaultFormatterConfig.semi,
    singleQuote: defaultFormatterConfig.singleQuote,
    trailingComma: defaultFormatterConfig.trailingComma,
    bracketSpacing: defaultFormatterConfig.bracketSpacing,
    arrowParens: defaultFormatterConfig.arrowParens,
  };

  generator.addFile(".config/oxfmt.json", {
    type: "text",
    content: JSON.stringify(oxfmtConfig, null, 2),
  });

  generator.addScript("format", "oxfmt -c .config/oxfmt.json --write .");
  generator.inject(
    "readme-tools",
    "[Oxfmt](https://oxc.rs/docs/guide/usage/formatter) - Fast Prettier-compatible code formatter"
  );
  generator.inject("vscode-extension-suggestion", "oxc.oxc-vscode");
  generator.addVscodeSetting("editor.defaultFormatter", "oxc.oxc-vscode");
  generator.addVscodeSetting("oxc.fmt.configPath", ".config/oxfmt.json");
  generator.addVscodeSetting("[json]", {
    "editor.defaultFormatter": "vscode.json-language-features",
  });
  generator.addVscodeSetting("[jsonc]", {
    "editor.defaultFormatter": "vscode.json-language-features",
  });
}
