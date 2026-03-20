import type {
    AiPlatform,
    EngineSpec,
    File,
    Formatter,
    Linter,
    PackageManagerSpec,
    PackageVersions,
} from '../types.js';
import { generateAiFiles } from './ai-files.js';
import {
    assignResolvedPackageVersion,
    formatNodeTypesVersion,
    formatPackageManager,
    getResolvedPackageVersion,
} from '../package-versions.js';
import {
    generateTypescriptConfigPackage,
    generateOxlintConfigPackage,
    generateEslintConfigPackage,
    generatePrettierConfigPackage,
    generateOxfmtConfigPackage,
} from './config-packages.js';
import { generateGitignore } from './gitignore.js';
import { packageJsonScripts } from './package-json-scripts.js';
import { generateVscodeFiles as generateSharedVscodeFiles } from './vscode.js';

/**
 * Parameters for generating a monorepo workspace.
 *
 * Note: Monorepos are currently pnpm-only. We use pnpm workspaces for
 * dependency management and the .config/* pattern for shared configs.
 *
 * TODO: Support yarn and npm workspaces in the future.
 */
export type MonorepoParams = {
    name: string;
    linter: Linter;
    formatter: Formatter;
    /** Currently always "pnpm" - monorepos are pnpm-only */
    packageManager: PackageManagerSpec;
    pnpmManageVersions?: boolean;
    engine?: EngineSpec;
    versions?: PackageVersions;
    /** AI platforms to generate files for */
    aiPlatforms?: AiPlatform[];
};

export type MonorepoResult = {
    files: Record<string, File>;
};

/**
 * Generates a monorepo workspace root structure with shared config packages.
 *
 * Note: Monorepos are currently pnpm-only. Detection relies on pnpm-workspace.yaml.
 * TODO: Support yarn and npm workspaces in the future.
 */
export function generateMonorepo(params: MonorepoParams): MonorepoResult {
    const {
        name,
        linter,
        formatter,
        packageManager,
        pnpmManageVersions,
        engine,
        versions = {},
        aiPlatforms,
    } = params;

    const files: Record<string, File> = {};
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
        const majorVersion = packageManager.version.split('.')[0];
        engines.pnpm = `>=${majorVersion}.0.0`;
        rootPackageJson.packageManager = formatPackageManager(packageManager);
    }

    if (engine?.version) {
        const majorVersion = engine.version.split('.')[0];
        engines[engine.name] = `>=${majorVersion}.0.0`;
    }

    if (Object.keys(engines).length > 0) {
        rootPackageJson.engines = engines;
    }

    files['package.json'] = {
        type: 'text',
        content: JSON.stringify(rootPackageJson, null, 2),
    };

    // pnpm-workspace.yaml - includes .config/* for config packages
    if (isPnpm) {
        const workspaceLines: string[] = [];

        if (pnpmManageVersions) {
            workspaceLines.push('manage-package-manager-versions: true', '');
        }

        workspaceLines.push('packages:', '  - ".config/*"', '  - "apps/*"', '  - "packages/*"', '');
        workspaceLines.push('onlyBuiltDependencies:', '  - esbuild');

        files['pnpm-workspace.yaml'] = {
            type: 'text',
            content: workspaceLines.join('\n'),
        };
    }

    // Root tsconfig.json extending @config/typescript
    files['tsconfig.json'] = {
        type: 'text',
        content: JSON.stringify(
            {
                extends: '@config/typescript/base.json',
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
    generateTypescriptConfigPackage(files);

    // Generate linter config package and root config
    if (linter === 'oxlint') {
        generateOxlintConfigPackage(files);
        // Root oxlint.json extending @config/oxlint
        files['oxlint.json'] = {
            type: 'text',
            content: JSON.stringify(
                {
                    $schema: './node_modules/oxlint/configuration_schema.json',
                    extends: ['@config/oxlint/base.json'],
                },
                null,
                2
            ),
        };
    } else if (linter === 'eslint') {
        generateEslintConfigPackage(files);
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
            content: JSON.stringify(biomeConfig, null, 2),
        };
    }

    // Generate formatter config package
    if (formatter === 'oxfmt') {
        generateOxfmtConfigPackage(files);
    } else if (formatter === 'prettier') {
        generatePrettierConfigPackage(files);
    }
    // biome formatter is handled above with linter

    // .gitignore
    files['.gitignore'] = generateGitignore('workspace-root');

    // .gitattributes
    files['.gitattributes'] = {
        type: 'text',
        content: `* text=auto eol=lf
*.{cmd,[cC][mM][dD]} text eol=crlf
*.{bat,[bB][aA][tT]} text eol=crlf
`,
    };

    // VS Code settings
    generateVscodeFiles(files, linter, formatter);

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
        generateAiFiles(files, {
            name,
            packageManager: packageManager.name,
            linter,
            formatter,
            isMonorepo: true,
            platforms: aiPlatforms,
        });
    }

    return { files };
}

/**
 * Generates VS Code configuration files for the monorepo root.
 */
export function generateVscodeFiles(
    files: Record<string, File>,
    linter: Linter,
    formatter: Formatter
): void {
    Object.assign(
        files,
        generateSharedVscodeFiles({
            linter,
            formatter,
            isMonorepo: true,
        })
    );
}

// Re-export for cli.ts which imports these directly
export {
    generateTypescriptConfigPackage,
    generateOxlintConfigPackage,
    generateEslintConfigPackage,
    generatePrettierConfigPackage,
    generateOxfmtConfigPackage,
} from './config-packages.js';
