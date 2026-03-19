import {
    formatNodeTypesVersion,
    formatPackageManager,
    getEngineName,
    getEngineSpec,
    getPackageManagerSpec,
} from '../package-versions.js';
import type { BaseTemplate, File, GenerateOptions } from '../types.js';

const DEFAULT_LIBRARY_VERSION = '0.1.0';

export type PackageJsonResult = {
    files: Record<string, File>;
};

export type PackageJsonParams = {
    name: string;
    baseTemplate: BaseTemplate;
    language: 'javascript' | 'typescript';
    isLibrary: boolean;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
    scripts: Record<string, string>;
    options: GenerateOptions;
    /** Workspace package names to add as dependencies (for monorepo apps) */
    workspaceDependencies?: string[];
};

/**
 * Generates package.json and related package manager files.
 */
export function generatePackageJson(params: PackageJsonParams): PackageJsonResult {
    const {
        name,
        baseTemplate,
        language,
        isLibrary,
        dependencies,
        devDependencies,
        peerDependencies,
        scripts,
        options,
        workspaceDependencies,
    } = params;

    const files: Record<string, File> = {};
    const packageManager = getPackageManagerSpec(options.packageManager);
    const isPnpm = packageManager.name === 'pnpm';

    const packageJson: Record<string, unknown> = {
        name,
        description: 'Built with 🌹 create-krispya',
        type: 'module',
    };

    // Add library-specific fields (ESM-first)
    if (isLibrary) {
        packageJson.version = DEFAULT_LIBRARY_VERSION;
        packageJson.main = './dist/index.mjs';
        packageJson.module = './dist/index.mjs';
        if (language === 'typescript') {
            packageJson.types = './dist/index.d.ts';
        }
        packageJson.exports = {
            '.': {
                ...(language === 'typescript' && { types: './dist/index.d.ts' }),
                import: './dist/index.mjs',
                require: './dist/index.cjs',
            },
        };
        packageJson.files = ['dist'];
    }

    // Helper to sort object keys alphabetically
    const sortKeys = <T extends Record<string, string>>(obj: T): T =>
        Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) as T;

    // Add workspace dependencies (monorepo packages)
    const allDependencies = { ...dependencies };
    if (workspaceDependencies && workspaceDependencies.length > 0) {
        for (const pkgName of workspaceDependencies) {
            allDependencies[pkgName] = 'workspace:*';
        }
    }

    const allDevDependencies = { ...devDependencies };
    const engine = getEngineSpec(options.engine);
    if (getEngineName(engine) === 'node' && engine.version) {
        allDevDependencies['@types/node'] ??= formatNodeTypesVersion(
            options.versions,
            options.engine
        );
    }

    packageJson.scripts = scripts;
    packageJson.dependencies = sortKeys(allDependencies);

    if (Object.keys(allDevDependencies).length > 0) {
        packageJson.devDependencies = sortKeys(allDevDependencies);
    }

    if (isLibrary && Object.keys(peerDependencies).length > 0) {
        packageJson.peerDependencies = sortKeys(peerDependencies);
    }

    // Add packageManager and engines fields (skip for monorepo sub-packages - use root config)
    const isMonorepoPackage = options.workspaceRoot != null;
    if (!isMonorepoPackage) {
        const engines: Record<string, string> = {};

        if (packageManager.version != null) {
            const majorVersion = packageManager.version.split('.')[0];
            engines[packageManager.name] = `>=${majorVersion}.0.0`;
            packageJson.packageManager = formatPackageManager(packageManager);
        }

        if (engine.version != null) {
            const majorVersion = engine.version.split('.')[0];
            engines[engine.name] = `>=${majorVersion}.0.0`;
        }

        if (Object.keys(engines).length > 0) {
            packageJson.engines = engines;
        }
    }

    files['package.json'] = {
        type: 'text',
        content: JSON.stringify(packageJson, null, 2),
    };

    // Add pnpm-workspace.yaml when pnpm is selected (but not in a workspace package)
    if (isPnpm && !options.workspaceRoot) {
        const manageVersions = options.pnpmManageVersions ?? true;
        const workspaceLines: string[] = [];

        if (manageVersions) {
            workspaceLines.push('manage-package-manager-versions: true', '');
        }

        workspaceLines.push('onlyBuiltDependencies:', '  - esbuild');

        files['pnpm-workspace.yaml'] = {
            type: 'text',
            content: workspaceLines.join('\n'),
        };
    }

    return { files };
}
