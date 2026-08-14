import { LIBRARY_BUILD_OUTPUT } from '../defaults/library.js';
import { renderJson } from '../renderers/json.js';
import { getBaseTemplate, getLanguageFromTemplate } from '../types.js';
import type {
  LibraryBundlerBuildArtifacts,
  LibraryBundlerBuildOptions,
} from './library-bundler-types.js';

export function createTsdownBuild(options: LibraryBundlerBuildOptions): LibraryBundlerBuildArtifacts {
  const template = options.template ?? 'vanilla';
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';
  const ext = language === 'typescript' ? 'ts' : 'js';
  const isMonorepo = options.workspaceRoot != null;
  const isStealth = (options.configStrategy ?? 'stealth') === 'stealth' && !isMonorepo;
  const tsconfigBuildPath = 'tsconfig.build.json';
  const files: LibraryBundlerBuildArtifacts['files'] = {};

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
    `    js: format === "es" ? "${LIBRARY_BUILD_OUTPUT.extensions.esm}" : "${LIBRARY_BUILD_OUTPUT.extensions.cjs}",`,
    `    dts: "${LIBRARY_BUILD_OUTPUT.extensions.declarations}",`,
    `  }),`,
    `})`,
  ];

  const configPath = isStealth ? `.config/tsdown.config.${ext}` : `tsdown.config.${ext}`;

  files[configPath] = {
    type: 'text',
    content: configLines.join('\n'),
  };

  if (language === 'typescript') {
    const baseTsconfigPath =
      options.typescriptConfigPath === undefined
        ? isMonorepo
          ? './tsconfig.json'
          : isStealth
            ? './.config/tsconfig.app.json'
            : './tsconfig.app.json'
        : options.typescriptConfigPath;

    files[tsconfigBuildPath] = {
      type: 'text',
      content: renderJson({
        $schema: 'https://json.schemastore.org/tsconfig',
        ...(baseTsconfigPath == null ? {} : { extends: baseTsconfigPath }),
        compilerOptions: { noEmit: false },
        include: ['src'],
      }),
    };
  }

  return {
    files,
    scripts: {
      build: isStealth ? `tsdown --config ${configPath}` : 'tsdown',
    },
  };
}
