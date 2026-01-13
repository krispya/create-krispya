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

  // Check if we're in a monorepo context (workspaceRoot is set)
  const isMonorepo = generator.options.workspaceRoot != null;

  if (isMonorepo) {
    // Use @config/oxfmt package from workspace (oxfmt itself is at root)
    generator.addDevDependency("@config/oxfmt", "workspace:*");

    const configPath = "node_modules/@config/oxfmt/base.json";

    generator.addScript("format", `oxfmt -c ${configPath} --write .`);
    generator.addVscodeSetting("oxc.fmt.configPath", configPath);
  } else {
    // Standalone: add oxfmt as devDependency
    const version = generator.versions.oxfmt ?? "0.1.0";
    generator.addDevDependency("oxfmt", `^${version}`);
    // Generate local config for standalone projects
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
    generator.addVscodeSetting("oxc.fmt.configPath", ".config/oxfmt.json");
  }

  generator.inject(
    "readme-tools",
    "[Oxfmt](https://oxc.rs/docs/guide/usage/formatter) - Fast Prettier-compatible code formatter"
  );
  generator.inject("vscode-extension-suggestion", "oxc.oxc-vscode");
  generator.addVscodeSetting("editor.defaultFormatter", "oxc.oxc-vscode");
  generator.addVscodeSetting("[json]", {
    "editor.defaultFormatter": "vscode.json-language-features",
  });
  generator.addVscodeSetting("[jsonc]", {
    "editor.defaultFormatter": "vscode.json-language-features",
  });
  generator.addVscodeSetting("[markdown]", {
    "editor.defaultFormatter": "vscode.markdown-language-features",
  });
  generator.addVscodeSetting("[yaml]", {
    "editor.defaultFormatter": "redhat.vscode-yaml",
  });
}
