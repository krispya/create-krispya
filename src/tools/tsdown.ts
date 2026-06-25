import { packageJsonScripts } from '../renderers/package-json-scripts.js';
import { getBaseTemplate, getLanguageFromTemplate, type PlanBuilder } from '../types.js';

export function planTsdown(builder: PlanBuilder) {
  builder.addDevDependency('tsdown');

  const template = builder.options.template ?? 'vanilla';
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';
  const ext = language === 'typescript' ? 'ts' : 'js';

  // Build config
  const configLines = [
    `import { defineConfig } from "tsdown"`,
    ``,
    `export default defineConfig({`,
    `  entry: ["./src/index.${ext}${isReact ? 'x' : ''}"],`,
    `  format: ["esm", "cjs"],`,
    `  dts: ${language === 'typescript'},`,
    `  clean: true,`,
  ];

  if (isReact) {
    configLines.push(`  esbuild: {`);
    configLines.push(`    jsx: "automatic",`);
    configLines.push(`  },`);
  }

  configLines.push(`})`);

  builder.addFile(`tsdown.config.${ext}`, {
    type: 'text',
    content: configLines.join('\n'),
  });

  builder.addScripts(packageJsonScripts.build.tsdown);
  builder.inject(
    'readme-libraries',
    '[tsdown](https://github.com/nicepkg/tsdown) - Fast TypeScript bundler powered by esbuild'
  );
}
