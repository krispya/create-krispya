import {
  assignResolvedPackageVersion,
  formatNodeTypesVersion,
  getResolvedPackageVersion,
} from '../workflow/resolve/package-versions.js';
import { getEngineName } from '../workflow/resolve/engine.js';
import { getSemverMajor } from '../utils/index.js';
import { renderJson } from './json.js';
import type {
  BaseTemplate,
  ConfigStrategy,
  EngineSpec,
  VirtualFile,
  PackageVersions,
} from '../types.js';

export type TypeScriptConfigResult = {
  files: Record<string, VirtualFile>;
  devDependencies: Record<string, string>;
};

export type TypeScriptConfigParams = {
  baseTemplate: BaseTemplate;
  /** When true, extends from @config/typescript package (monorepo context) */
  useConfigPackage?: boolean;
  /** Config strategy for single-package workspaces */
  configStrategy?: ConfigStrategy;
  /** Engine version used for config/runtime type packages */
  engine?: EngineSpec;
  /** Resolved npm package versions */
  versions?: PackageVersions;
};

/**
 * Generates TypeScript configuration files for the project.
 * In monorepo context (useConfigPackage=true): simple tsconfig.json extending from @config/typescript.
 * In single-package stealth mode: solution-style tsconfig with separate app and node configs in .config/.
 * In single-package root mode: single tsconfig.json with all settings inline.
 */
export function renderTypescriptConfig(
  baseTemplateOrParams: BaseTemplate | TypeScriptConfigParams
): TypeScriptConfigResult {
  // Support both old signature (baseTemplate) and new signature (params object)
  const params: TypeScriptConfigParams =
    typeof baseTemplateOrParams === 'string'
      ? { baseTemplate: baseTemplateOrParams }
      : baseTemplateOrParams;

  const {
    baseTemplate,
    useConfigPackage,
    configStrategy = 'stealth',
    engine,
    versions = {},
  } = params;
  const isReact = baseTemplate === 'react';
  const isR3f = baseTemplate === 'r3f';
  const isTypeScript7 = (getSemverMajor(getResolvedPackageVersion(versions, 'typescript')) ?? 0) >= 7;
  const typeScript7Options = isTypeScript7
    ? { noUncheckedSideEffectImports: true, libReplacement: false }
    : {};
  const files: Record<string, VirtualFile> = {};
  const devDependencies: Record<string, string> = {};

  assignResolvedPackageVersion(devDependencies, versions, 'typescript');

  // Add Node.js types when using the Node engine.
  if (getEngineName(engine) === 'node') {
    devDependencies['@types/node'] = formatNodeTypesVersion(versions, engine);
  } else {
    // Fallback to latest LTS if no version specified
    devDependencies['@types/node'] = '^22.0.0';
  }

  // Add React types for React templates
  if (isReact || isR3f) {
    assignResolvedPackageVersion(devDependencies, versions, '@types/react');
    assignResolvedPackageVersion(devDependencies, versions, '@types/react-dom');
  }

  // Add Three.js types for r3f
  if (isR3f) {
    assignResolvedPackageVersion(devDependencies, versions, '@types/three', '~');
  }

  if (useConfigPackage) {
    // Monorepo context - simple single tsconfig extending from @config package
    devDependencies['@config/typescript'] = 'workspace:*';

    const baseConfig =
      isReact || isR3f ? '@config/typescript/react.json' : '@config/typescript/app.json';

    files['tsconfig.json'] = {
      type: 'text',
      content: renderJson({
        $schema: 'https://json.schemastore.org/tsconfig',
        extends: baseConfig,
        include: ['src/**/*', 'tests/**/*'],
      }),
    };

    return { files, devDependencies };
  }

  if (configStrategy === 'stealth') {
    // Single-package stealth - solution-style tsconfig with .config/ folder
    const tsConfig = {
      $schema: 'https://json.schemastore.org/tsconfig',
      files: [],
      references: [{ path: './.config/tsconfig.app.json' }, { path: './.config/tsconfig.node.json' }],
    };

    files['tsconfig.json'] = {
      type: 'text',
      content: renderJson(tsConfig),
    };

    // App config - browser environment for src/tests
    const tsConfigApp = {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['DOM', 'DOM.Iterable', 'ESNext'],
        ...(isTypeScript7 ? { types: [] } : {}),
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
        noEmit: true,
        ...typeScript7Options,
        ...(isReact || isR3f ? { jsx: 'react-jsx' } : {}),
      },
      include: ['../src', '../tests'],
    };

    files['.config/tsconfig.app.json'] = {
      type: 'text',
      content: renderJson(tsConfigApp),
    };

    // Node config - Node environment for config files
    const tsConfigNode = {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['ESNext'],
        types: ['node'],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
        noEmit: true,
        ...typeScript7Options,
      },
      include: ['../*.config.ts', './*.ts'],
    };

    files['.config/tsconfig.node.json'] = {
      type: 'text',
      content: renderJson(tsConfigNode),
    };
  } else {
    // Single-package root - solution-style tsconfig with files at root
    const tsConfig = {
      $schema: 'https://json.schemastore.org/tsconfig',
      files: [],
      references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
    };

    files['tsconfig.json'] = {
      type: 'text',
      content: renderJson(tsConfig),
    };

    // App config - browser environment for src/tests
    const tsConfigApp = {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['DOM', 'DOM.Iterable', 'ESNext'],
        ...(isTypeScript7 ? { types: [] } : {}),
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
        noEmit: true,
        ...typeScript7Options,
        ...(isReact || isR3f ? { jsx: 'react-jsx' } : {}),
      },
      include: ['src', 'tests'],
    };

    files['tsconfig.app.json'] = {
      type: 'text',
      content: renderJson(tsConfigApp),
    };

    // Node config - Node environment for config files
    const tsConfigNode = {
      $schema: 'https://json.schemastore.org/tsconfig',
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        lib: ['ESNext'],
        types: ['node'],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
        noEmit: true,
        ...typeScript7Options,
      },
      include: ['*.config.ts'],
    };

    files['tsconfig.node.json'] = {
      type: 'text',
      content: renderJson(tsConfigNode),
    };
  }

  return { files, devDependencies };
}
