import { assertLibraryBundlerCompatible, getLibraryBundler } from '../intent/bundlers.js';
import { getLanguageFromTemplate, type LibraryBundler, type PlanBuilder } from '../types.js';
import { createTsdownBuild } from './tools/tsdown.js';
import { createUnbuildBuild } from './tools/unbuild.js';
import type {
  LibraryBundlerBuildArtifacts,
  LibraryBundlerBuildOptions,
} from './tools/library-bundler-types.js';

const libraryBundlerBuilds: Record<
  LibraryBundler,
  (options: LibraryBundlerBuildOptions) => LibraryBundlerBuildArtifacts
> = {
  tsdown: createTsdownBuild,
  unbuild: createUnbuildBuild,
};

export function createLibraryBundlerBuild(
  name: LibraryBundler,
  options: LibraryBundlerBuildOptions
): LibraryBundlerBuildArtifacts {
  return libraryBundlerBuilds[name](options);
}

export function planLibraryBundler(builder: PlanBuilder, name: LibraryBundler): void {
  const bundler = getLibraryBundler(name);
  const language = getLanguageFromTemplate(builder.options.template ?? 'vanilla');
  assertLibraryBundlerCompatible(bundler, {
    typescriptVersion: language === 'typescript' ? builder.getVersion('typescript') : undefined,
  });
  const build = createLibraryBundlerBuild(bundler.name, {
    template: builder.options.template,
    configStrategy: builder.isStealthConfig() ? 'stealth' : 'root',
    workspaceRoot: builder.options.workspaceRoot,
  });

  builder.addDevDependency(bundler.packageName);
  for (const [path, file] of Object.entries(build.files)) {
    builder.addFile(path, file);
  }
  builder.addScripts(build.scripts);
  builder.inject('readme-libraries', bundler.libraryDescription);
}
