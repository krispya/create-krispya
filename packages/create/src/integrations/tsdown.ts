import { getBaseTemplate, getLanguageFromTemplate, type Generator } from "../index.js";

export function generateTsdown(generator: Generator) {
  generator.addDevDependency("tsdown", "^0.12.0");

  const template = generator.options.template ?? "vanilla";
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isReact = baseTemplate === "react" || baseTemplate === "r3f";
  const ext = language === "typescript" ? "ts" : "js";

  // Build config
  const configLines = [
    `import { defineConfig } from "tsdown"`,
    ``,
    `export default defineConfig({`,
    `  entry: ["./src/index.${ext}${isReact ? "x" : ""}"],`,
    `  format: ["esm", "cjs"],`,
    `  dts: ${language === "typescript"},`,
    `  clean: true,`,
  ];

  if (isReact) {
    configLines.push(`  esbuild: {`);
    configLines.push(`    jsx: "automatic",`);
    configLines.push(`  },`);
  }

  configLines.push(`})`);

  generator.addFile(`tsdown.config.${ext}`, {
    type: "text",
    content: configLines.join("\n"),
  });

  generator.addScript("build", "tsdown");
  generator.inject(
    "readme-libraries",
    "[tsdown](https://github.com/nicepkg/tsdown) - Fast TypeScript bundler powered by esbuild",
  );
}

