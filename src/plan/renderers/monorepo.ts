import type {
  VirtualFile,
  Formatter,
  Linter,
  MonorepoParams,
  PackageManagerSpec,
} from '../../types.js';
import { renderAiFiles } from './ai-files.js';
import {
  assignResolvedPackageVersion,
  formatNodeTypesVersion,
  getResolvedPackageVersion,
} from '../../intent/package-versions.js';
import {
  formatPackageManager,
  getPackageManagerProfile,
} from '../../intent/package-manager/index.js';
import { renderPnpmWorkspaceConfig } from './pnpm-workspace-config.js';
import { getSemverMajorString } from '../../utils/index.js';
import {
  renderTypescriptConfigPackage,
  renderOxlintConfigPackage,
  renderEslintConfigPackage,
  renderPrettierConfigPackage,
  renderOxfmtConfigPackage,
} from './config-packages.js';
import { renderEditorConfig } from './editorconfig.js';
import { renderGitignore } from './gitignore.js';
import { renderJson } from './json.js';
import { packageJsonScripts } from './package-json-scripts.js';
import { renderVscodeFiles as renderSharedVscodeFiles } from './vscode.js';

export type { MonorepoParams } from '../../types.js';

export type MonorepoResult = {
  files: Record<string, VirtualFile>;
};

/**
 * Generates a monorepo workspace root structure with shared config packages.
 *
 * Note: Monorepos are currently pnpm-only. Detection relies on pnpm-workspace.yaml.
 * TODO: Support yarn and npm workspaces in the future.
 */
export function renderMonorepo(params: MonorepoParams): MonorepoResult {
  const {
    name,
    linter,
    formatter,
    packageManager,
    pnpmManageVersions,
    engine,
    versions = {},
    ide = 'vscode',
    aiPlatforms,
  } = params;

  const files: Record<string, VirtualFile> = {};
  const isPnpm = packageManager.name === 'pnpm';

  // Root package.json (private workspace root)
  const devDependencies: Record<string, string> = {};

  // Add Node.js types matching the Node version (needed for config files)
  if (engine?.name === 'node' && engine.version) {
    devDependencies['@types/node'] = formatNodeTypesVersion(versions, engine);
  } else {
    // Fallback to latest LTS if no version specified
    devDependencies['@types/node'] = '^22.0.0';
  }

  if (linter === 'oxlint') {
    assignResolvedPackageVersion(devDependencies, versions, 'oxlint');
    assignResolvedPackageVersion(devDependencies, versions, 'oxlint-tsgolint');
  } else if (linter === 'eslint') {
    assignResolvedPackageVersion(devDependencies, versions, 'eslint');
  } else if (linter === 'biome') {
    assignResolvedPackageVersion(devDependencies, versions, '@biomejs/biome');
  }

  if (formatter === 'oxfmt') {
    assignResolvedPackageVersion(devDependencies, versions, 'oxfmt');
  } else if (formatter === 'prettier') {
    assignResolvedPackageVersion(devDependencies, versions, 'prettier');
  }
  // biome formatter is handled above with linter

  const rootPackageJson: Record<string, unknown> = {
    name: 'root',
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: packageJsonScripts.monorepoRoot(linter, formatter),
    devDependencies,
  };

  // Add engines field if needed
  const engines: Record<string, string> = {};

  if (isPnpm && packageManager.version) {
    const majorVersion = getSemverMajorString(packageManager.version);
    engines.pnpm = `>=${majorVersion}.0.0`;
    rootPackageJson.packageManager = formatPackageManager(packageManager);
  }

  if (engine?.version) {
    const majorVersion = getSemverMajorString(engine.version);
    engines[engine.name] = `>=${majorVersion}.0.0`;
  }

  if (Object.keys(engines).length > 0) {
    rootPackageJson.engines = engines;
  }

  files['package.json'] = {
    type: 'text',
    content: renderJson(rootPackageJson, { inlineArrays: false }),
  };

  // pnpm-workspace.yaml - includes .config/* for config packages
  if (isPnpm) {
    files['pnpm-workspace.yaml'] = {
      type: 'text',
      content: renderPnpmWorkspaceConfig({
        profile: getPackageManagerProfile(packageManager),
        manageVersions: pnpmManageVersions,
        packages: ['.config/*', 'apps/*', 'packages/*'],
      }),
    };
  }

  // Root tsconfig.json extending @config/typescript
  files['tsconfig.json'] = {
    type: 'text',
    content: JSON.stringify(
      {
        extends: '@config/typescript/base.json',
        files: [],
        compilerOptions: {
          noEmit: true,
        },
        references: [],
      },
      null,
      2
    ),
  };

  // Generate @config/typescript package
  renderTypescriptConfigPackage(files, versions);

  // Generate linter config package and root config
  if (linter === 'oxlint') {
    renderOxlintConfigPackage(files);
    // Root oxlint.json extending @config/oxlint
    files['oxlint.json'] = {
      type: 'text',
      content: JSON.stringify(
        {
          $schema: './node_modules/oxlint/configuration_schema.json',
          extends: ['@config/oxlint/base.json'],
          options: {
            typeAware: true,
            typeCheck: true,
          },
        },
        null,
        2
      ),
    };
  } else if (linter === 'eslint') {
    renderEslintConfigPackage(files);
    // Root eslint.config.js importing from @config/eslint
    files['eslint.config.js'] = {
      type: 'text',
      content: `import base from "@config/eslint/base";

export default [...base];
`,
    };
  } else if (linter === 'biome') {
    const biomeVersion = getResolvedPackageVersion(versions, '@biomejs/biome');
    // Biome config at root (handles both linting and formatting when selected)
    const biomeConfig = {
      $schema: `https://biomejs.dev/schemas/${biomeVersion}/schema.json`,
      vcs: {
        enabled: true,
        clientKind: 'git',
        useIgnoreFile: true,
      },
      linter: {
        enabled: true,
        rules: {
          recommended: true,
        },
      },
      formatter: {
        enabled: formatter === 'biome',
      },
    };
    files['biome.json'] = {
      type: 'text',
      content: renderJson(biomeConfig),
    };
  }

  // Generate formatter config package
  if (formatter === 'oxfmt') {
    renderOxfmtConfigPackage(files);
  } else if (formatter === 'prettier') {
    renderPrettierConfigPackage(files);
  }
  // biome formatter is handled above with linter

  // Root editor and git files
  files['.editorconfig'] = renderEditorConfig();
  files['.gitignore'] = renderGitignore('workspace-root');

  // .gitattributes
  files['.gitattributes'] = {
    type: 'text',
    content: `* text=auto eol=lf
*.{cmd,[cC][mM][dD]} text eol=crlf
*.{bat,[bB][aA][tT]} text eol=crlf
`,
  };

  // IDE settings
  if (ide === 'vscode') {
    renderVscodeFiles(files, linter, formatter, packageManager.name);
  }

  // README
  files['README.md'] = {
    type: 'text',
    content: `# ${name}

This monorepo workspace was generated with create-krispya.

## Structure

- \`apps/\` - Applications
- \`packages/\` - Shared packages and libraries
- \`.config/\` - Shared configuration packages

## Development Commands

- \`${packageManager.name} install\` to install all dependencies
- \`${packageManager.name} run dev\` to run all applications in development mode
- \`${packageManager.name} run build\` to build all packages and applications
- \`${packageManager.name} run test\` to run tests across the workspace
- \`${packageManager.name} run lint\` to lint all code
- \`${packageManager.name} run format\` to format all code

## Adding Packages

To add a new package to this workspace, run create-krispya from this directory and it will detect the monorepo.
`,
  };

  // Generate AI files
  if (aiPlatforms && aiPlatforms.length > 0) {
    renderAiFiles(files, {
      name,
      packageManager: packageManager.name,
      linter,
      formatter,
      isMonorepo: true,
      hasTypecheck: false,
      platforms: aiPlatforms,
    });
  }

  return { files };
}

/**
 * Generates VS Code configuration files for the monorepo root.
 */
export function renderVscodeFiles(
  files: Record<string, VirtualFile>,
  linter: Linter,
  formatter: Formatter,
  packageManager: PackageManagerSpec['name'] = 'pnpm'
): void {
  Object.assign(
    files,
    renderSharedVscodeFiles({
      linter,
      formatter,
      isMonorepo: true,
      packageManager,
    })
  );
}

// Re-export for cli.ts which imports these directly
export {
  renderTypescriptConfigPackage,
  renderOxlintConfigPackage,
  renderEslintConfigPackage,
  renderPrettierConfigPackage,
  renderOxfmtConfigPackage,
} from './config-packages.js';
