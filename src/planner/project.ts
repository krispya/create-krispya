import { gitAttributesContent } from '../defaults/git.js';
import { renderAiFiles } from '../renderers/ai-files.js';
import {
  renderGitignore,
  renderEditorConfig,
  renderPackageJson,
  renderReadme,
  renderSourceFiles,
  renderTestFiles,
  renderTypescriptConfig,
  renderViteConfig,
  renderVscodeFiles,
} from '../renderers/index.js';
import { planBiome } from '../adapters/biome.js';
import { planDrei } from '../adapters/drei.js';
import { planEslint } from '../adapters/eslint.js';
import { planFiber } from '../adapters/fiber.js';
import { planGithubPages } from '../adapters/github-pages.js';
import { planHandle } from '../adapters/handle.js';
import { planKoota } from '../adapters/koota.js';
import { planLeva } from '../adapters/leva.js';
import { planOffscreen } from '../adapters/offscreen.js';
import { planOxfmt } from '../adapters/oxfmt.js';
import { planOxlint } from '../adapters/oxlint.js';
import { planPostprocessing } from '../adapters/postprocessing.js';
import { planPrettier } from '../adapters/prettier.js';
import { planRapier } from '../adapters/rapier.js';
import { planTriplex } from '../adapters/triplex.js';
import { planTsdown } from '../adapters/tsdown.js';
import { planUikit } from '../adapters/uikit.js';
import { planUnbuild } from '../adapters/unbuild.js';
import { planVitest } from '../adapters/vitest.js';
import { planViverse } from '../adapters/viverse.js';
import { planXr } from '../adapters/xr.js';
import { planZustand } from '../adapters/zustand.js';
import { merge } from '../utils/index.js';
import {
  assignResolvedPackageVersion,
  formatResolvedPackageVersion,
  getPackageManagerName,
  getResolvedPackageVersion,
} from '../package-versions.js';
import {
  type CodeInjectionLocation,
  type DependencyVersionOptions,
  type VirtualFile,
  type ProjectOptions,
  type ProjectPlanInput,
  type PlanBuilder,
  getBaseTemplate,
  getLanguageFromTemplate,
  shouldEnableReactCompiler,
} from '../types.js';
import { isProjectPlanInput, projectPlanInputToOptions, resolveProjectPlanInput } from './input.js';
import { resolveProjectFacts } from './resolve.js';
import type { ProjectPlan } from './types.js';

/**
 * Main generation function that creates all project files.
 */
export async function planProject(input: ProjectPlanInput | ProjectOptions): Promise<ProjectPlan> {
  const planInput = isProjectPlanInput(input) ? input : resolveProjectPlanInput(input);
  return createProjectPlan(await resolveProjectFacts(planInput));
}

function createProjectPlan(planInput: ProjectPlanInput): ProjectPlan {
  const options = projectPlanInputToOptions(planInput);

  // Deep cloning since adapters might decide to modify the options
  const clonedOptions = structuredClone(options);
  const template = clonedOptions.template ?? 'vanilla';
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isVanilla = baseTemplate === 'vanilla';
  const isReact = baseTemplate === 'react';
  const isR3f = baseTemplate === 'r3f';
  const isLibrary = clonedOptions.projectType === 'library';
  const useReactCompiler = shouldEnableReactCompiler(clonedOptions);
  const libraryBundler = planInput.libraryBundler.tool;
  const ide = planInput.ide.tool;

  const files: Record<string, VirtualFile> = {
    ...clonedOptions.files,
  };
  const replacements: Array<{ search: string; replace: string }> = clonedOptions.replacements ?? [];

  const versions = clonedOptions.versions ?? {};
  const dependencies: Record<string, string> = {
    ...clonedOptions.dependencies,
  };
  const devDependencies: Record<string, string> = {};
  const peerDependencies: Record<string, string> = {};

  if (!isLibrary) {
    assignResolvedPackageVersion(devDependencies, versions, 'vite');
  }

  if (isReact || isR3f) {
    if (isLibrary) {
      peerDependencies['react'] = '^18.0.0 || ^19.0.0';
      peerDependencies['react-dom'] = '^18.0.0 || ^19.0.0';
    } else {
      assignResolvedPackageVersion(dependencies, versions, 'react');
      assignResolvedPackageVersion(dependencies, versions, 'react-dom');
      assignResolvedPackageVersion(devDependencies, versions, '@vitejs/plugin-react');
      if (useReactCompiler) {
        assignResolvedPackageVersion(devDependencies, versions, '@babel/core');
        assignResolvedPackageVersion(devDependencies, versions, '@rolldown/plugin-babel');
        assignResolvedPackageVersion(devDependencies, versions, 'babel-plugin-react-compiler');
      }
    }
  }

  if (isR3f) {
    if (isLibrary) {
      peerDependencies['three'] = '>=0.150.0';
      peerDependencies['@react-three/fiber'] = '^8.0.0 || ^9.0.0';
    } else {
      assignResolvedPackageVersion(dependencies, versions, 'three', '~');
      assignResolvedPackageVersion(dependencies, versions, '@react-three/fiber');
    }
  }

  if (language === 'typescript') {
    const tsResult = renderTypescriptConfig({
      baseTemplate,
      useConfigPackage: clonedOptions.workspaceRoot != null,
      configStrategy: clonedOptions.configStrategy,
      engine: clonedOptions.engine,
      versions,
    });
    Object.assign(files, tsResult.files);
    Object.assign(devDependencies, tsResult.devDependencies);
    if (useReactCompiler) {
      assignResolvedPackageVersion(devDependencies, versions, '@types/babel__core');
    }
  }

  const codeSnippets: Partial<Record<CodeInjectionLocation, Array<string>>> = {};
  const vscodeSettings: Record<string, unknown> = {};
  const scripts: Record<string, string> = {};

  // Setup vite config imports based on template (only for apps)
  if (!isLibrary && (isReact || isR3f)) {
    codeSnippets['vite-config-import'] = [
      useReactCompiler
        ? "import react, { reactCompilerPreset } from '@vitejs/plugin-react';"
        : "import react from '@vitejs/plugin-react';",
    ];
    if (useReactCompiler) {
      codeSnippets['vite-config-import'].push("import babel from '@rolldown/plugin-babel';");
    }
  }

  // Setup R3F-specific imports (only for apps)
  if (!isLibrary && isR3f) {
    codeSnippets['import'] = [`import { Canvas } from "@react-three/fiber"`];
  }

  const defaultName = isVanilla ? 'vanilla-app' : isReact ? 'react-app' : 'react-three-app';
  const name = clonedOptions.name ?? defaultName;

  // Build vite config based on template (only for apps)
  let viteConfig: Record<string, unknown> = {
    base: './',
  };

  if (!isLibrary && (isReact || isR3f)) {
    viteConfig.plugins = useReactCompiler
      ? ['$raw:react()', '$raw:babel({ presets: [reactCompilerPreset()] })']
      : ['$raw:react()'];
  }

  if (!isLibrary && isR3f) {
    viteConfig.resolve = { dedupe: ['three'] };
  }

  // Check if we're in a monorepo context (sub-package)
  const isMonorepoPackage = clonedOptions.workspaceRoot != null;

  const builder: PlanBuilder = {
    options: clonedOptions,
    versions,
    getVersion(name) {
      return getResolvedPackageVersion(versions, name);
    },
    isStealthConfig() {
      return (clonedOptions.configStrategy ?? 'stealth') === 'stealth';
    },
    addDependency(name, options) {
      if (dependencies[name] != null) {
        return;
      }
      dependencies[name] = resolveDependencySemver(name, versions, options);
    },
    addDevDependency(name, options) {
      if (devDependencies[name] != null) {
        return;
      }
      devDependencies[name] = resolveDependencySemver(name, versions, options);
    },
    addPeerDependency(name, semver) {
      if (peerDependencies[name] != null) {
        return;
      }
      peerDependencies[name] = semver;
    },
    addFile(path, content) {
      files[path] = content;
    },
    addScripts(nextScripts) {
      Object.assign(scripts, nextScripts);
    },
    addScript(name, command) {
      this.addScripts({ [name]: command });
    },
    inject(location, code) {
      let entries = codeSnippets[location];
      if (entries == null) {
        codeSnippets[location] = entries = [];
      }
      entries.push(code);
    },
    replace(search, replace) {
      replacements.push({ search, replace });
    },
    configureVite(config) {
      viteConfig = merge(viteConfig, config);
    },
    addVscodeSetting(key, value) {
      vscodeSettings[key] = value;
    },
  };

  // Only run R3F adapters for r3f template
  if (isR3f) {
    planDrei(builder, planInput.features.drei);
    planHandle(builder, planInput.features.handle);
    planKoota(builder, planInput.features.koota);
    planLeva(builder, planInput.features.leva);
    planOffscreen(builder, planInput.features.offscreen);
    planPostprocessing(builder, planInput.features.postprocessing);
    planRapier(builder, planInput.features.rapier);
    planUikit(builder, planInput.features.uikit);
    planXr(builder, planInput.features.xr);
    planZustand(builder, planInput.features.zustand);
    planFiber(builder, planInput.features.fiber);
    planTriplex(builder, planInput.features.triplex);
    planViverse(builder, planInput.features.viverse);
  }

  // GitHub Pages works for all templates (apps only)
  if (!isLibrary) {
    planGithubPages(builder, planInput.features.githubPages);
  }

  // Library bundler adapters
  if (isLibrary) {
    if (libraryBundler === 'unbuild') {
      planUnbuild(builder);
    } else if (libraryBundler === 'tsdown') {
      planTsdown(builder);
    }
  }

  // Testing - only if enabled (libraries default to vitest, apps default to none)
  const testing = planInput.testing.tool;
  if (testing === 'vitest') {
    planVitest(builder, planInput.testing as Parameters<typeof planVitest>[1]);
  }

  // Linter and formatter adapters
  const linter = planInput.linter.tool;
  const formatter = planInput.formatter.tool;

  // Generate linter adapters
  if (planInput.linter.tool === 'eslint') {
    planEslint(builder, planInput.linter as Parameters<typeof planEslint>[1]);
  } else if (planInput.linter.tool === 'oxlint') {
    planOxlint(builder, planInput.linter as Parameters<typeof planOxlint>[1]);
  } else if (planInput.linter.tool === 'biome') {
    planBiome(builder, {
      linter: planInput.linter as NonNullable<Parameters<typeof planBiome>[1]>['linter'],
      formatter:
        planInput.formatter.tool === 'biome'
          ? (planInput.formatter as NonNullable<Parameters<typeof planBiome>[1]>['formatter'])
          : undefined,
    });
  }

  // Generate formatter adapters (skip biome if already handled above)
  if (planInput.formatter.tool === 'prettier') {
    planPrettier(builder, planInput.formatter as Parameters<typeof planPrettier>[1]);
  } else if (planInput.formatter.tool === 'oxfmt') {
    planOxfmt(builder, planInput.formatter as Parameters<typeof planOxfmt>[1]);
  } else if (planInput.formatter.tool === 'biome' && planInput.linter.tool !== 'biome') {
    // Only generate biome for formatting if it wasn't already generated for linting
    planBiome(builder, {
      formatter: planInput.formatter as NonNullable<Parameters<typeof planBiome>[1]>['formatter'],
    });
  }

  for (const { code, location } of clonedOptions.injections ?? []) {
    builder.inject(location, code);
  }

  // Generate vite.config.ts (only for apps)
  if (!isLibrary) {
    files['vite.config.ts'] = renderViteConfig({ viteConfig, codeSnippets });
  }

  const packageManager = getPackageManagerName(options.packageManager);

  // Generate README
  files['README.md'] = renderReadme({
    name,
    baseTemplate,
    isLibrary,
    libraryBundler,
    packageManager,
    codeSnippets,
  });

  // Generate source files
  Object.assign(
    files,
    renderSourceFiles({
      name,
      baseTemplate,
      language,
      isLibrary,
      codeSnippets,
      replacements,
    })
  );

  // Generate test files (only if testing is enabled)
  if (testing === 'vitest') {
    Object.assign(
      files,
      renderTestFiles({
        baseTemplate,
        language,
        isLibrary,
      })
    );
  }

  // Generate package.json
  Object.assign(
    files,
    renderPackageJson({
      name,
      baseTemplate,
      language,
      isLibrary,
      dependencies,
      devDependencies,
      peerDependencies,
      scripts,
      options: clonedOptions,
      workspaceDependencies: clonedOptions.workspaceDependencies,
    }).files
  );

  // Generate VS Code files (skip for monorepo sub-packages - use workspace root config)
  if (!isMonorepoPackage && ide === 'vscode') {
    Object.assign(
      files,
      renderVscodeFiles({
        codeSnippets,
        vscodeSettings,
        linter,
        formatter,
        configStrategy: clonedOptions.configStrategy,
        isMonorepo: false,
        packageManager,
      })
    );
  }

  // Git files (skip for monorepo sub-packages - use workspace root config)
  if (!isMonorepoPackage) {
    files['.editorconfig'] = renderEditorConfig();
    files['.gitignore'] = renderGitignore('standalone');
    files['.gitattributes'] = { type: 'text', content: gitAttributesContent };
  }

  // AI files (skip for monorepo sub-packages - use workspace root config)
  if (!isMonorepoPackage && planInput.aiAgents.config.platforms.length > 0) {
    renderAiFiles(files, {
      name,
      packageManager: getPackageManagerName(clonedOptions.packageManager),
      linter: clonedOptions.linter ?? 'oxlint',
      formatter: clonedOptions.formatter ?? 'prettier',
      isMonorepo: false,
      configStrategy: clonedOptions.configStrategy,
      hasTypecheck: language === 'typescript',
      platforms: planInput.aiAgents.config.platforms,
    });
  }

  if (language === 'javascript') {
    // TODO: transpile tsx? to jsx? files
  }
  // TODO: execute prettier on ts(x), js(x), and json files

  return {
    files,
    dependencies,
    devDependencies,
    peerDependencies,
    scripts,
    vscodeSettings,
    vscodeExtensions: [...new Set(codeSnippets['vscode-extension-suggestion'] ?? [])],
    injections: Object.entries(codeSnippets).flatMap(([location, entries]) =>
      (entries ?? []).map((code) => ({
        location: location as CodeInjectionLocation,
        code,
      }))
    ),
    replacements,
    warnings: [],
  };
}

function resolveDependencySemver(
  name: string,
  versions: Record<string, string>,
  options: DependencyVersionOptions = {}
): string {
  if (options.version != null) {
    return options.version;
  }

  return formatResolvedPackageVersion(versions, name, options.prefix);
}
