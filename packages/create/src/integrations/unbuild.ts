import { getBaseTemplate, getLanguageFromTemplate, type Generator } from "../index.js";

export function generateUnbuild(generator: Generator) {
  generator.addDevDependency("unbuild", "^3.5.0");

  const template = generator.options.template ?? "vanilla";
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isReact = baseTemplate === "react" || baseTemplate === "r3f";
  const ext = language === "typescript" ? "ts" : "js";

  // Build config
  const buildConfigLines = [
    `import { defineBuildConfig } from "unbuild"`,
    ``,
    `export default defineBuildConfig({`,
    `  entries: ["./src/index"],`,
    `  declaration: ${language === "typescript"},`,
    `  clean: true,`,
    `  rollup: {`,
    `    emitCJS: true,`,
  ];

  // Add external dependencies for React libraries
  if (isReact) {
    buildConfigLines.push(`    esbuild: {`);
    buildConfigLines.push(`      jsx: "automatic",`);
    buildConfigLines.push(`    },`);
  }

  buildConfigLines.push(`  },`);
  buildConfigLines.push(`})`);

  generator.addFile(`build.config.${ext}`, {
    type: "text",
    content: buildConfigLines.join("\n"),
  });

  generator.addScript("build", "unbuild");
  generator.inject(
    "readme-libraries",
    "[unbuild](https://github.com/unjs/unbuild) - Unified JavaScript build system",
  );
}

