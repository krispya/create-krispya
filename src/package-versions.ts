import {
    type EngineSpec,
    type Formatter,
    type GenerateOptions,
    getBaseTemplate,
    getLanguageFromTemplate,
    type Linter,
    type PackageManagerName,
    type PackageManagerSpec,
    type PackageVersions,
    type VersionRangePrefix,
} from './types.js';
import {
    getLatestNodeVersion,
    getLatestNpmCliVersion,
    getLatestNpmVersion,
    getLatestPnpmVersion,
    getLatestYarnVersion,
} from './utils.js';

type PackageVersionDefinition = {
    fallbackVersion: string;
    prefix?: VersionRangePrefix;
};

const PACKAGE_VERSION_DEFINITIONS: Record<string, PackageVersionDefinition> = {
    '@biomejs/biome': { fallbackVersion: '2.0.0' },
    '@react-three/drei': { fallbackVersion: '10.0.0' },
    '@react-three/fiber': { fallbackVersion: '9.0.0' },
    '@react-three/handle': { fallbackVersion: '6.6.16' },
    '@react-three/offscreen': { fallbackVersion: '0.0.8' },
    '@react-three/postprocessing': { fallbackVersion: '3.0.4' },
    '@react-three/rapier': { fallbackVersion: '2.1.0' },
    '@react-three/uikit': { fallbackVersion: '0.8.15' },
    '@react-three/xr': { fallbackVersion: '6.6.16' },
    '@testing-library/dom': { fallbackVersion: '10.4.0' },
    '@testing-library/react': { fallbackVersion: '16.2.0' },
    '@types/react': { fallbackVersion: '19.0.0' },
    '@types/react-dom': { fallbackVersion: '19.0.0' },
    '@types/three': { fallbackVersion: '0.175.0', prefix: '~' },
    '@vitejs/plugin-basic-ssl': { fallbackVersion: '2.0.0' },
    '@vitejs/plugin-react': { fallbackVersion: '4.4.1' },
    '@viverse/cli': { fallbackVersion: '0.9.5-beta.8' },
    eslint: { fallbackVersion: '9.17.0' },
    'eslint-plugin-react-hooks': { fallbackVersion: '5.1.0' },
    jsdom: { fallbackVersion: '26.0.0' },
    koota: { fallbackVersion: '0.4.0' },
    leva: { fallbackVersion: '0.10.0' },
    oxfmt: { fallbackVersion: '0.21.0' },
    oxlint: { fallbackVersion: '1.36.0' },
    prettier: { fallbackVersion: '3.4.2' },
    react: { fallbackVersion: '19.0.0' },
    'react-dom': { fallbackVersion: '19.0.0' },
    three: { fallbackVersion: '0.175.0', prefix: '~' },
    tsdown: { fallbackVersion: '0.12.0' },
    'typescript-eslint': { fallbackVersion: '8.18.0' },
    unbuild: { fallbackVersion: '3.5.0' },
    vite: { fallbackVersion: '6.3.4' },
    vitest: { fallbackVersion: '4.0.0' },
    zustand: { fallbackVersion: '5.0.3' },
};

function addPackageName(
    packageNames: Set<string>,
    explicitVersions: Set<string>,
    packageName: string
): void {
    if (!explicitVersions.has(packageName)) {
        packageNames.add(packageName);
    }
}

function getExplicitVersionPackages(options: GenerateOptions): Set<string> {
    return new Set([
        ...Object.keys(options.dependencies ?? {}),
        ...Object.keys(options.versions ?? {}),
    ]);
}

export function getPackageFallbackVersion(packageName: string): string {
    const definition = PACKAGE_VERSION_DEFINITIONS[packageName];
    if (definition == null) {
        throw new Error(`Missing package version definition for ${packageName}`);
    }
    return definition.fallbackVersion;
}

export function getResolvedPackageVersion(versions: PackageVersions, packageName: string): string {
    return versions[packageName] ?? getPackageFallbackVersion(packageName);
}

export function formatResolvedPackageVersion(
    versions: PackageVersions,
    packageName: string,
    prefix?: VersionRangePrefix
): string {
    const resolvedPrefix = prefix ?? PACKAGE_VERSION_DEFINITIONS[packageName]?.prefix ?? '^';
    return `${resolvedPrefix}${getResolvedPackageVersion(versions, packageName)}`;
}

export function assignResolvedPackageVersion(
    target: Record<string, string>,
    versions: PackageVersions,
    packageName: string,
    prefix?: VersionRangePrefix
): void {
    target[packageName] = formatResolvedPackageVersion(versions, packageName, prefix);
}

export function getPackageManagerSpec(packageManager?: PackageManagerSpec): PackageManagerSpec {
    return packageManager ?? { name: 'pnpm' };
}

export function getPackageManagerName(packageManager?: PackageManagerSpec): PackageManagerName {
    return getPackageManagerSpec(packageManager).name;
}

export function formatPackageManager(packageManager?: PackageManagerSpec): string {
    const spec = getPackageManagerSpec(packageManager);
    return spec.version ? `${spec.name}@${spec.version}` : spec.name;
}

export function parsePackageManager(packageManager?: string): PackageManagerSpec | undefined {
    if (packageManager == null || packageManager.length === 0) {
        return undefined;
    }

    const atIndex = packageManager.indexOf('@');
    if (atIndex === -1) {
        return { name: packageManager as PackageManagerName };
    }

    return {
        name: packageManager.slice(0, atIndex) as PackageManagerName,
        version: packageManager.slice(atIndex + 1),
    };
}

export function getEngineSpec(engine?: EngineSpec): EngineSpec {
    return engine ?? { name: 'node' };
}

export function getEngineName(engine?: EngineSpec): string {
    return getEngineSpec(engine).name;
}

export function formatEngine(engine?: EngineSpec): string {
    const spec = getEngineSpec(engine);
    return spec.version ? `${spec.name}@${spec.version}` : spec.name;
}

export function parseEngine(engines?: Record<string, string>): EngineSpec | undefined {
    if (engines == null) {
        return undefined;
    }

    const [name, range] =
        Object.entries(engines).find(
            ([engineName]) => engineName !== 'npm' && engineName !== 'pnpm' && engineName !== 'yarn'
        ) ?? [];

    if (name == null) {
        return undefined;
    }

    const version = range?.match(/(\d+(?:\.\d+(?:\.\d+)?)?)/)?.[1];
    return { name, version };
}

export async function resolvePackageManager(options: GenerateOptions) {
    const packageManager = getPackageManagerSpec(options.packageManager);
    if (packageManager.version == null) {
        if (packageManager.name === 'pnpm') {
            packageManager.version = await getLatestPnpmVersion();
        } else if (packageManager.name === 'yarn') {
            packageManager.version = await getLatestYarnVersion();
        } else if (packageManager.name === 'npm') {
            packageManager.version = await getLatestNpmCliVersion();
        }
    }

    return packageManager;
}

export async function resolveEngine(options: GenerateOptions) {
    const engine = getEngineSpec(options.engine);
    if (engine.version == null && engine.name === 'node') {
        engine.version = await getLatestNodeVersion();
    }
    return engine;
}

export async function resolvePackageVersions(
    packageNames: Iterable<string>,
    existingVersions: PackageVersions = {}
): Promise<PackageVersions> {
    const versions: PackageVersions = { ...existingVersions };
    const uniquePackageNames = [...new Set(packageNames)];

    await Promise.all(
        uniquePackageNames.map(async (packageName) => {
            if (versions[packageName] != null) return;

            versions[packageName] = await getLatestNpmVersion(
                packageName,
                getPackageFallbackVersion(packageName)
            );
        })
    );

    return versions;
}

export async function resolveProjectPackageVersions(
    options: GenerateOptions
): Promise<PackageVersions> {
    return resolvePackageVersions(collectProjectPackageNames(options), options.versions);
}

export async function resolveMonorepoRootPackageVersions(params: {
    linter: Linter;
    formatter: Formatter;
    versions?: PackageVersions;
}): Promise<PackageVersions> {
    const packageNames = new Set<string>();
    const explicitVersions = new Set(Object.keys(params.versions ?? {}));
    addPackageName(packageNames, explicitVersions, getLinterPackage(params.linter));
    if (params.formatter !== 'biome' || params.linter !== 'biome') {
        addPackageName(packageNames, explicitVersions, getFormatterPackage(params.formatter));
    }
    return resolvePackageVersions(packageNames, params.versions);
}

function collectProjectPackageNames(options: GenerateOptions): string[] {
    const packageNames = new Set<string>();
    const explicitVersions = getExplicitVersionPackages(options);
    const template = options.template ?? 'vanilla';
    const baseTemplate = getBaseTemplate(template);
    const language = getLanguageFromTemplate(template);
    const isLibrary = options.projectType === 'library';
    const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';
    const isR3f = baseTemplate === 'r3f';
    const isTypescript = language === 'typescript';
    const inWorkspace = options.workspaceRoot != null;
    const testing = options.testing ?? (isLibrary ? 'vitest' : 'none');
    const linter = options.linter ?? 'oxlint';
    const formatter = options.formatter ?? 'prettier';
    const bundler = options.libraryBundler ?? 'unbuild';
    const packageManager = getPackageManagerName(options.packageManager);

    if (!isLibrary) {
        addPackageName(packageNames, explicitVersions, 'vite');
    }

    if (isReact) {
        if (!isLibrary) {
            addPackageName(packageNames, explicitVersions, 'react');
            addPackageName(packageNames, explicitVersions, 'react-dom');
            addPackageName(packageNames, explicitVersions, '@vitejs/plugin-react');
        }

        if (isTypescript) {
            addPackageName(packageNames, explicitVersions, '@types/react');
            addPackageName(packageNames, explicitVersions, '@types/react-dom');
        }
    }

    if (isR3f) {
        if (!isLibrary) {
            addPackageName(packageNames, explicitVersions, 'three');
            addPackageName(packageNames, explicitVersions, '@react-three/fiber');
        }

        if (isTypescript) {
            addPackageName(packageNames, explicitVersions, '@types/three');
        }

        if (isEnabledOption(options.drei)) {
            addPackageName(packageNames, explicitVersions, '@react-three/drei');
        }
        if (isEnabledOption(options.handle)) {
            addPackageName(packageNames, explicitVersions, '@react-three/handle');
        }
        if (isEnabledOption(options.koota)) {
            addPackageName(packageNames, explicitVersions, 'koota');
        }
        if (isEnabledOption(options.leva)) {
            addPackageName(packageNames, explicitVersions, 'leva');
        }
        if (isEnabledOption(options.rapier)) {
            addPackageName(packageNames, explicitVersions, '@react-three/rapier');
        }
        if (isEnabledOption(options.uikit)) {
            addPackageName(packageNames, explicitVersions, '@react-three/uikit');
        }
        if (isEnabledOption(options.zustand)) {
            addPackageName(packageNames, explicitVersions, 'zustand');
        }
        if (isEnabledOption(options.xr)) {
            addPackageName(packageNames, explicitVersions, '@react-three/xr');
            addPackageName(packageNames, explicitVersions, '@vitejs/plugin-basic-ssl');
        }
        if (!isEnabledOption(options.xr) && isEnabledOption(options.offscreen)) {
            addPackageName(packageNames, explicitVersions, '@react-three/offscreen');
        }
        if (!isEnabledOption(options.xr) && isEnabledOption(options.postprocessing)) {
            addPackageName(packageNames, explicitVersions, '@react-three/postprocessing');
        }
        if (isEnabledOption(options.viverse) && packageManager === 'npm') {
            addPackageName(packageNames, explicitVersions, '@viverse/cli');
        }
    }

    if (testing === 'vitest') {
        addPackageName(packageNames, explicitVersions, 'vitest');
        if (isReact) {
            addPackageName(packageNames, explicitVersions, '@testing-library/react');
            addPackageName(packageNames, explicitVersions, '@testing-library/dom');
            addPackageName(packageNames, explicitVersions, 'jsdom');
        }
    }

    if (linter === 'eslint') {
        addPackageName(packageNames, explicitVersions, 'eslint');
        if (isTypescript) {
            addPackageName(packageNames, explicitVersions, 'typescript-eslint');
        }
        if (isReact) {
            addPackageName(packageNames, explicitVersions, 'eslint-plugin-react-hooks');
        }
    } else if (linter === 'oxlint') {
        if (!inWorkspace) {
            addPackageName(packageNames, explicitVersions, 'oxlint');
        }
    } else if (linter === 'biome') {
        addPackageName(packageNames, explicitVersions, '@biomejs/biome');
    }

    if (formatter === 'prettier') {
        addPackageName(packageNames, explicitVersions, 'prettier');
    } else if (formatter === 'oxfmt') {
        if (!inWorkspace) {
            addPackageName(packageNames, explicitVersions, 'oxfmt');
        }
    } else if (formatter === 'biome') {
        addPackageName(packageNames, explicitVersions, '@biomejs/biome');
    }

    if (isLibrary) {
        addPackageName(packageNames, explicitVersions, bundler === 'unbuild' ? 'unbuild' : 'tsdown');
    }

    return [...packageNames];
}

function getLinterPackage(linter: Linter): string {
    if (linter === 'biome') {
        return '@biomejs/biome';
    }
    return linter;
}

function getFormatterPackage(formatter: Formatter): string {
    if (formatter === 'biome') {
        return '@biomejs/biome';
    }
    return formatter;
}

function isEnabledOption(option: unknown): boolean {
    return option != null && option !== false;
}
