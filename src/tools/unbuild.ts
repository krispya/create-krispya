import { LIBRARY_BUILD_OUTPUT } from '../defaults/library.js';
import { getBaseTemplate, getLanguageFromTemplate } from '../types.js';
import type {
  LibraryBundlerBuildArtifacts,
  LibraryBundlerBuildOptions,
} from './library-bundler-types.js';

export function createUnbuildBuild(
  options: LibraryBundlerBuildOptions
): LibraryBundlerBuildArtifacts {
  const template = options.template ?? 'vanilla';
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';
  const ext = language === 'typescript' ? 'ts' : 'js';
  const files: LibraryBundlerBuildArtifacts['files'] = {};

  // Check if we're in a monorepo context (workspaceRoot is set)
  const isMonorepo = options.workspaceRoot != null;

  // Build config
  const buildConfigLines = [
    `import { defineBuildConfig } from "unbuild"`,
    ``,
    `export default defineBuildConfig({`,
    `  entries: ["./src/index"],`,
    `  outDir: "${LIBRARY_BUILD_OUTPUT.directory}",`,
    `  declaration: ${language === 'typescript'},`,
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

  const isStealth = (options.configStrategy ?? 'stealth') === 'stealth' && !isMonorepo;
  const configPath = isStealth ? `.config/build.config.${ext}` : `build.config.${ext}`;

  files[configPath] = {
    type: 'text',
    content: buildConfigLines.join('\n'),
  };

  return {
    files,
    scripts: {
      build: isStealth ? `unbuild --config ${configPath}` : 'unbuild',
    },
  };
}
