import { GitAttributes } from "./constants.js";
import {
  generatePackageJson,
  generateReadme,
  generateSourceFiles,
  generateTestFiles,
  generateTypescriptConfig,
  generateViteConfig,
  generateVscodeFiles,
} from "./generators/index.js";
import { generateBiome } from "./integrations/biome.js";
import { generateDrei } from "./integrations/drei.js";
import { generateEslint } from "./integrations/eslint.js";
import { generateFiber } from "./integrations/fiber.js";
import { generateGithubPages } from "./integrations/github-pages.js";
import { generateHandle } from "./integrations/handle.js";
import { generateKoota } from "./integrations/koota.js";
import { generateLeva } from "./integrations/leva.js";
import { generateOffscreen } from "./integrations/offscreen.js";
import { generateOxfmt } from "./integrations/oxfmt.js";
import { generateOxlint } from "./integrations/oxlint.js";
import { generatePostprocessing } from "./integrations/postprocessing.js";
import { generatePrettier } from "./integrations/prettier.js";
import { generateRapier } from "./integrations/rapier.js";
import { generateTriplex } from "./integrations/triplex.js";
import { generateTsdown } from "./integrations/tsdown.js";
import { generateUikit } from "./integrations/uikit.js";
import { generateUnbuild } from "./integrations/unbuild.js";
import { generateVitest } from "./integrations/vitest.js";
import { generateViverse } from "./integrations/viverse.js";
import { generateXr } from "./integrations/xr.js";
import { generateZustand } from "./integrations/zustand.js";
import { merge } from "./merge.js";
import {
  type CodeInjectionLocation,
  type File,
  type GenerateOptions,
  type Generator,
  type PackageVersions,
  getBaseTemplate,
  getLanguageFromTemplate,
} from "./types.js";

// Re-export types and utilities
export * from "./types.js";
export * from "./utils.js";

/**
 * Main generation function that creates all project files.
 */
export function generate(options: GenerateOptions) {
  // Deep cloning since integrations might decide to modify the options
  const clonedOptions = structuredClone(options);
  const template = clonedOptions.template ?? "vanilla";
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isVanilla = baseTemplate === "vanilla";
  const isReact = baseTemplate === "react";
  const isR3f = baseTemplate === "r3f";
  const isLibrary = clonedOptions.projectType === "library";
  const libraryBundler = clonedOptions.libraryBundler ?? "unbuild";

  const files: Record<string, File> = {
    ...clonedOptions.files,
  };
  const replacements: Array<{ search: string; replace: string }> =
    clonedOptions.replacements ?? [];

  // Base dependencies
  const versions = clonedOptions.versions ?? {};
  const dependencies: Record<string, string> = {
    ...clonedOptions.dependencies,
  };
  const devDependencies: Record<string, string> = {};
  const peerDependencies: Record<string, string> = {};

  // Add vite for applications only (as devDependency)
  if (!isLibrary) {
    devDependencies.vite = versions.vite ? `^${versions.vite}` : "^6.3.4";
  }

  // Add React dependencies for react and r3f templates
  if (isReact || isR3f) {
    if (isLibrary) {
      // Libraries use peerDependencies
      peerDependencies["react"] = "^18.0.0 || ^19.0.0";
      peerDependencies["react-dom"] = "^18.0.0 || ^19.0.0";
    } else {
      dependencies["react"] = "^19.0.0";
      dependencies["react-dom"] = "^19.0.0";
      devDependencies["@vitejs/plugin-react"] = "^4.4.1";
    }
  }

  // Add Three.js dependencies for r3f template
  if (isR3f) {
    if (isLibrary) {
      peerDependencies["three"] = ">=0.150.0";
      peerDependencies["@react-three/fiber"] = "^8.0.0 || ^9.0.0";
    } else {
      dependencies["three"] = "~0.175.0";
      dependencies["@react-three/fiber"] = "^9.0.0";
    }
  }

  // TypeScript configuration
  if (language === "typescript") {
    const tsResult = generateTypescriptConfig(baseTemplate);
    Object.assign(files, tsResult.files);
    Object.assign(devDependencies, tsResult.devDependencies);
  }

  const codeSnippets: Partial<Record<CodeInjectionLocation, Array<string>>> = {};
  const vscodeSettings: Record<string, unknown> = {};
  const scripts: Record<string, string> = isLibrary
    ? {} // Library build scripts are added by bundler integrations
    : {
        dev: "vite",
        build: "vite build",
      };

  // Setup vite config imports based on template (only for apps)
  if (!isLibrary && (isReact || isR3f)) {
    codeSnippets["vite-config-import"] = ["import react from '@vitejs/plugin-react'"];
  }

  // Setup R3F-specific imports (only for apps)
  if (!isLibrary && isR3f) {
    codeSnippets["import"] = [`import { Canvas } from "@react-three/fiber"`];
  }

  const defaultName = isVanilla
    ? "vanilla-app"
    : isReact
      ? "react-app"
      : "react-three-app";
  const name = clonedOptions.name ?? defaultName;

  // Build vite config based on template (only for apps)
  let viteConfig: Record<string, unknown> = {
    base: "./",
  };

  if (!isLibrary && (isReact || isR3f)) {
    viteConfig.plugins = ["$raw:react()"];
  }

  if (!isLibrary && isR3f) {
    viteConfig.resolve = { dedupe: ["three"] };
  }

  const generator: Generator = {
    options: clonedOptions,
    versions,
    addDependency(name, semver) {
      const existingSemver = dependencies[name];
      if (existingSemver != null) {
        // TODO: intersect existingSemver with semver and write to semver
        // TODO: throw error if no overlap
      }
      dependencies[name] = semver;
    },
    addDevDependency(name, semver) {
      const existingSemver = devDependencies[name];
      if (existingSemver != null) {
        // TODO: intersect existingSemver with semver and write to semver
        // TODO: throw error if no overlap
      }
      devDependencies[name] = semver;
    },
    addFile(path, content) {
      files[path] = content;
    },
    addScript(name, command) {
      scripts[name] = command;
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

  // Only run R3F integrations for r3f template
  if (isR3f) {
    generateDrei(generator, clonedOptions.drei);
    generateHandle(generator, clonedOptions.handle);
    generateKoota(generator, clonedOptions.koota);
    generateLeva(generator, clonedOptions.leva);
    generateOffscreen(generator, clonedOptions.offscreen);
    generatePostprocessing(generator, clonedOptions.postprocessing);
    generateRapier(generator, clonedOptions.rapier);
    generateUikit(generator, clonedOptions.uikit);
    generateXr(generator, clonedOptions.xr);
    generateZustand(generator, clonedOptions.zustand);
    generateFiber(generator, clonedOptions.fiber);
    generateTriplex(generator, clonedOptions.triplex);
    generateViverse(generator, clonedOptions.viverse);
  }

  // GitHub Pages works for all templates (apps only)
  if (!isLibrary) {
    generateGithubPages(generator, clonedOptions.githubPages);
  }

  // Library bundler integrations
  if (isLibrary) {
    if (libraryBundler === "unbuild") {
      generateUnbuild(generator);
    } else if (libraryBundler === "tsdown") {
      generateTsdown(generator);
    }
    // Add release script for libraries
    const packageManager = clonedOptions.packageManager ?? "pnpm";
    generator.addScript("release", `${packageManager} run build && ${packageManager} publish`);
  }

  // Testing - always include vitest
  generateVitest(generator);

  // Linter and formatter integrations
  const linter = clonedOptions.linter;
  const formatter = clonedOptions.formatter;

  // Generate linter integrations
  if (linter === "eslint") {
    generateEslint(generator, true);
    generator.addVscodeSetting("biome.enabled", false);
    generator.addVscodeSetting("oxc.enable", false);
  } else if (linter === "oxlint") {
    generateOxlint(generator, true);
    generator.addVscodeSetting("eslint.enable", false);
    generator.addVscodeSetting("biome.enabled", false);
  } else if (linter === "biome") {
    generateBiome(generator, {
      linter: true,
      formatter: formatter === "biome",
    });
    generator.addVscodeSetting("eslint.enable", false);
    generator.addVscodeSetting("oxc.enable", false);
  }

  // Generate formatter integrations (skip biome if already handled above)
  if (formatter === "prettier") {
    generatePrettier(generator, true);
  } else if (formatter === "oxfmt") {
    generateOxfmt(generator, true);
  } else if (formatter === "biome" && linter !== "biome") {
    // Only generate biome for formatting if it wasn't already generated for linting
    generateBiome(generator, { linter: false, formatter: true });
    generator.addVscodeSetting("eslint.enable", false);
    generator.addVscodeSetting("oxc.enable", false);
  }

  for (const { code, location } of clonedOptions.injections ?? []) {
    generator.inject(location, code);
  }

  // Generate vite.config.ts (only for apps)
  if (!isLibrary) {
    files["vite.config.ts"] = generateViteConfig({ viteConfig, codeSnippets });
  }

  const packageManager = options.packageManager ?? "pnpm";

  // Generate README
  files["README.md"] = generateReadme({
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
    generateSourceFiles({
      name,
      baseTemplate,
      language,
      isLibrary,
      codeSnippets,
      replacements,
    })
  );

  // Generate test files
  Object.assign(
    files,
    generateTestFiles({
      baseTemplate,
      language,
      isLibrary,
    })
  );

  // Generate package.json
  Object.assign(
    files,
    generatePackageJson({
      name,
      baseTemplate,
      language,
      isLibrary,
      dependencies,
      devDependencies,
      peerDependencies,
      scripts,
      options: clonedOptions,
    }).files
  );

  // Generate VS Code files
  Object.assign(files, generateVscodeFiles({ codeSnippets, vscodeSettings }));

  // Git files
  files[".gitignore"] = {
    type: "text",
    content: ["node_modules", "dist", "*.tsbuildinfo"].join("\n"),
  };
  files[".gitattributes"] = { type: "text", content: GitAttributes };

  if (language === "javascript") {
    // TODO: transpile tsx? to jsx? files
  }
  // TODO: execute prettier on ts(x), js(x), and json files

  return files;
}
