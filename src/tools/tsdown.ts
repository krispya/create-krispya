import { packageJsonScripts } from '../renderers/package-json-scripts.js';
import { renderJson } from '../renderers/json.js';
import { getBaseTemplate, getLanguageFromTemplate, type PlanBuilder } from '../types.js';

export function planTsdown(builder: PlanBuilder) {
  builder.addDevDependency('tsdown');

  const template = builder.options.template ?? 'vanilla';
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';
  const ext = language === 'typescript' ? 'ts' : 'js';
  const isMonorepo = builder.options.workspaceRoot != null;
  const isStealth = builder.isStealthConfig() && !isMonorepo;
  const tsconfigBuildPath = 'tsconfig.build.json';

  // Build config
  const configLines = [
    `import { defineConfig } from "tsdown"`,
    ``,
    `export default defineConfig({`,
    ...(isStealth ? [`  cwd: "..",`] : []),
    `  entry: ["./src/index.${ext}${isReact ? 'x' : ''}"],`,
    `  format: ["esm", "cjs"],`,
    `  dts: ${language === 'typescript' ? `{ tsconfig: "${tsconfigBuildPath}" }` : 'false'},`,
    `  clean: true,`,
    `  platform: "neutral",`,
    `  outExtensions: ({ format }) => ({`,
    `    js: format === "es" ? ".mjs" : ".cjs",`,
    `    dts: ".d.ts",`,
    `  }),`,
    `})`,
  ];

  const configPath = isStealth ? `.config/tsdown.config.${ext}` : `tsdown.config.${ext}`;

  builder.addFile(configPath, {
    type: 'text',
    content: configLines.join('\n'),
  });

  if (language === 'typescript') {
    const baseTsconfigPath = isMonorepo
      ? './tsconfig.json'
      : isStealth
        ? './.config/tsconfig.app.json'
        : './tsconfig.app.json';

    builder.addFile(tsconfigBuildPath, {
      type: 'text',
      content: renderJson({
        $schema: 'https://json.schemastore.org/tsconfig',
        extends: baseTsconfigPath,
        compilerOptions: { noEmit: false },
        include: ['src'],
      }),
    });
  }

  builder.addScripts(packageJsonScripts.build.tsdown(isStealth ? configPath : undefined));
  builder.inject(
    'readme-libraries',
    '[tsdown](https://tsdown.dev/) - Fast TypeScript bundler powered by Rolldown'
  );
}
