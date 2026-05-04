import * as p from '@clack/prompts';
import { getConfigStrategy, getCustomTemplates, type CustomTemplate } from '../config.js';
import type {
    EngineSpec,
    GenerateOptions,
    Ide,
    LibraryBundler,
    PackageManagerName,
    PackageManagerSpec,
    ProjectType,
    Template,
} from '../types.js';
import { getBaseTemplate } from '../types.js';
import { getPackageManagerName } from '../package-versions.js';
import { generateRandomName } from '../utils.js';
import { formatConfigSummary, formatMonorepoConfigSummary } from './format.js';

/**
 * Gets default options for a given template and project type.
 * For R3F templates, pass integrations array to specify which integrations to include.
 * When inheritedSettings is provided, uses those values instead of defaults.
 */
export function getDefaultOptions(
    template: Template,
    name: string,
    projectType: ProjectType = 'app',
    libraryBundler?: LibraryBundler,
    integrations?: string[],
    inheritedSettings?: InheritedWorkspaceSettings
): GenerateOptions {
    const baseTemplate = getBaseTemplate(template);
    const base: GenerateOptions = {
        name,
        template,
        projectType,
        libraryBundler: projectType === 'library' ? (libraryBundler ?? 'unbuild') : undefined,
        packageManager: inheritedSettings?.packageManager ?? { name: 'pnpm' },
        pnpmManageVersions: inheritedSettings?.pnpmManageVersions ?? true,
        engine: inheritedSettings?.engine ?? { name: 'node', version: 'latest' },
        linter: inheritedSettings?.linter ?? 'oxlint',
        formatter: inheritedSettings?.formatter ?? 'prettier',
        // Libraries get vitest by default, apps don't
        testing: projectType === 'library' ? 'vitest' : 'none',
        configStrategy: getConfigStrategy(),
        ide: 'vscode',
    };

    if (baseTemplate === 'r3f' && integrations) {
        return {
            ...base,
            drei: integrations.includes('drei') ? {} : undefined,
            handle: integrations.includes('handle') ? {} : undefined,
            leva: integrations.includes('leva') ? {} : undefined,
            postprocessing: integrations.includes('postprocessing') ? {} : undefined,
            rapier: integrations.includes('rapier') ? {} : undefined,
            xr: integrations.includes('xr') ? {} : undefined,
            uikit: integrations.includes('uikit') ? {} : undefined,
            offscreen: integrations.includes('offscreen') ? {} : undefined,
            zustand: integrations.includes('zustand') ? {} : undefined,
            koota: integrations.includes('koota') ? {} : undefined,
            triplex: integrations.includes('triplex') ? {} : undefined,
            viverse: integrations.includes('viverse') ? {} : undefined,
        };
    }

    return base;
}

/**
 * Gets the default project name based on template.
 */
export function getDefaultProjectName(template: Template): string {
    const base = getBaseTemplate(template);
    switch (base) {
        case 'vanilla':
            return `vanilla-${generateRandomName()}`;
        case 'react':
            return `react-${generateRandomName()}`;
        case 'r3f':
            return `react-three-${generateRandomName()}`;
    }
}

/**
 * Prompts for R3F integrations selection.
 */
async function promptForR3fIntegrations(presets?: CliPresets): Promise<string[]> {
    // Build initial values from presets or default to drei
    const initialValues: string[] = [];
    if (presets) {
        if (presets.drei) initialValues.push('drei');
        if (presets.handle) initialValues.push('handle');
        if (presets.leva) initialValues.push('leva');
        if (presets.postprocessing) initialValues.push('postprocessing');
        if (presets.rapier) initialValues.push('rapier');
        if (presets.xr) initialValues.push('xr');
        if (presets.uikit) initialValues.push('uikit');
        if (presets.offscreen) initialValues.push('offscreen');
        if (presets.zustand) initialValues.push('zustand');
        if (presets.koota) initialValues.push('koota');
        if (presets.triplex) initialValues.push('triplex');
        if (presets.viverse) initialValues.push('viverse');
    }

    const selected = await p.multiselect({
        message: 'R3F integrations',
        options: [
            { value: 'drei', label: 'Drei' },
            { value: 'handle', label: 'Handle' },
            { value: 'leva', label: 'Leva' },
            { value: 'postprocessing', label: 'Postprocessing' },
            { value: 'rapier', label: 'Rapier' },
            { value: 'xr', label: 'XR' },
            { value: 'uikit', label: 'UIKit' },
            { value: 'offscreen', label: 'Offscreen' },
            { value: 'zustand', label: 'Zustand' },
            { value: 'koota', label: 'Koota' },
            { value: 'triplex', label: 'Triplex' },
            { value: 'viverse', label: 'Viverse' },
        ],
        initialValues: initialValues.length > 0 ? initialValues : ['drei'],
        required: false,
    });

    if (p.isCancel(selected)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    return selected as string[];
}

/**
 * Prompts user for customization options.
 * For R3F templates, integrations should be passed in (already selected upfront).
 * When inheritedSettings is provided, workspace-level settings are skipped.
 * When presets are provided, they pre-fill prompt defaults.
 */
export async function promptForCustomization(
    template: Template,
    name: string,
    projectType: ProjectType,
    integrations?: string[],
    inheritedSettings?: InheritedWorkspaceSettings,
    presets?: CliPresets
): Promise<GenerateOptions> {
    // Library bundler selection (only for libraries)
    let libraryBundler: LibraryBundler | undefined;
    if (projectType === 'library') {
        const bundler = await p.select({
            message: 'Library bundler',
            options: [
                { value: 'unbuild', label: 'unbuild', hint: 'unjs, simple config' },
                { value: 'tsdown', label: 'tsdown', hint: 'fast, esbuild-based' },
            ],
            initialValue: presets?.bundler ?? 'unbuild',
        });

        if (p.isCancel(bundler)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }
        libraryBundler = bundler as LibraryBundler;
    }

    // Skip workspace-level settings if inherited from workspace
    let engine: EngineSpec = inheritedSettings?.engine ??
        presets?.engine ?? { name: 'node', version: 'latest' };
    let finalPackageManager: PackageManagerName =
        inheritedSettings?.packageManager?.name ?? presets?.packageManager ?? 'pnpm';
    let pnpmManageVersions: boolean =
        inheritedSettings?.pnpmManageVersions ?? presets?.pnpmManageVersions ?? true;

    if (!inheritedSettings?.engine?.version) {
        const nodeVersionInput = await p.text({
            message: 'Node.js version',
            placeholder: presets?.engine?.version ?? 'latest',
            defaultValue: presets?.engine?.version ?? 'latest',
            validate: (value) => {
                if (!value.length) return 'Required';
                if (value !== 'latest' && !/^\d+(\.\d+(\.\d+)?)?$/.test(value)) {
                    return 'Must be "latest" or a valid semver (e.g., "22" or "22.13.0")';
                }
            },
        });

        if (p.isCancel(nodeVersionInput)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }
        engine = { name: 'node', version: nodeVersionInput };
    }

    if (!inheritedSettings?.packageManager) {
        const packageManager = await p.select({
            message: 'Package manager',
            options: [
                { value: 'pnpm', label: 'pnpm' },
                { value: 'npm', label: 'npm' },
                { value: 'yarn', label: 'yarn' },
            ],
            initialValue: presets?.packageManager ?? 'pnpm',
        });

        if (p.isCancel(packageManager)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }

        finalPackageManager = packageManager as PackageManagerName;

        if (packageManager === 'pnpm') {
            const managePnpm = await p.confirm({
                message: 'Enable manage-package-manager-versions?',
                initialValue: presets?.pnpmManageVersions ?? true,
            });
            if (p.isCancel(managePnpm)) {
                p.cancel('Operation cancelled.');
                process.exit(0);
            }
            pnpmManageVersions = managePnpm;
        }
    }

    // Skip linter/formatter prompts if inherited from workspace
    let linter: 'oxlint' | 'eslint' | 'biome' =
        inheritedSettings?.linter ?? presets?.linter ?? 'oxlint';
    let formatter: 'oxfmt' | 'prettier' | 'biome' =
        inheritedSettings?.formatter ?? presets?.formatter ?? 'prettier';

    if (!inheritedSettings?.linter) {
        const linterChoice = await p.select({
            message: 'Linter',
            options: [
                { value: 'oxlint', label: 'Oxlint', hint: 'fast, from OXC' },
                { value: 'eslint', label: 'ESLint', hint: 'classic' },
                { value: 'biome', label: 'Biome', hint: 'all-in-one' },
            ],
            initialValue: presets?.linter ?? 'oxlint',
        });

        if (p.isCancel(linterChoice)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }
        linter = linterChoice as 'oxlint' | 'eslint' | 'biome';
    }

    if (!inheritedSettings?.formatter) {
        const formatterChoice = await p.select({
            message: 'Formatter',
            options: [
                { value: 'prettier', label: 'Prettier', hint: 'widely adopted' },
                { value: 'oxfmt', label: 'Oxfmt', hint: 'fast, Prettier-compatible' },
                { value: 'biome', label: 'Biome', hint: 'all-in-one' },
            ],
            initialValue: presets?.formatter ?? 'prettier',
        });

        if (p.isCancel(formatterChoice)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }
        formatter = formatterChoice as 'oxfmt' | 'prettier' | 'biome';
    }

    // Testing - default to vitest for libraries, none for apps
    const testing = await p.select({
        message: 'Testing',
        options: [
            { value: 'vitest', label: 'Vitest', hint: 'fast, Vite-native' },
            { value: 'none', label: 'None' },
        ],
        initialValue: projectType === 'library' ? 'vitest' : 'none',
    });

    if (p.isCancel(testing)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    const language = await p.select({
        message: 'Language',
        options: [
            { value: 'typescript', label: 'TypeScript' },
            { value: 'javascript', label: 'JavaScript' },
        ],
        initialValue: 'typescript',
    });

    if (p.isCancel(language)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    // Config strategy
    const configStrategyChoice = await p.select({
        message: 'Config strategy',
        options: [
            { value: 'stealth', label: 'stealth', hint: 'configs in .config/' },
            { value: 'root', label: 'root', hint: 'configs at project root' },
        ],
        initialValue: getConfigStrategy(),
    });

    if (p.isCancel(configStrategyChoice)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    const ideChoice = await p.select({
        message: 'IDE config',
        options: [
            { value: 'vscode', label: 'vscode' },
            { value: 'none', label: 'None' },
        ],
        initialValue: presets?.ide ?? 'vscode',
    });

    if (p.isCancel(ideChoice)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    // Derive final template based on language selection
    const baseTemplate = getBaseTemplate(template);
    const finalTemplate: Template =
        language === 'javascript' ? (`${baseTemplate}-js` as Template) : (baseTemplate as Template);

    const base: GenerateOptions = {
        name,
        template: finalTemplate,
        projectType,
        libraryBundler: projectType === 'library' ? libraryBundler : undefined,
        engine,
        packageManager: { name: finalPackageManager },
        pnpmManageVersions,
        linter,
        formatter,
        testing: testing as 'vitest' | 'none',
        configStrategy: configStrategyChoice as 'stealth' | 'root',
        ide: ideChoice as Ide,
    };

    // For R3F, use the integrations passed in (already selected upfront)
    if (baseTemplate === 'r3f' && integrations) {
        return {
            ...base,
            drei: integrations.includes('drei') ? {} : undefined,
            handle: integrations.includes('handle') ? {} : undefined,
            leva: integrations.includes('leva') ? {} : undefined,
            postprocessing: integrations.includes('postprocessing') ? {} : undefined,
            rapier: integrations.includes('rapier') ? {} : undefined,
            xr: integrations.includes('xr') ? {} : undefined,
            uikit: integrations.includes('uikit') ? {} : undefined,
            offscreen: integrations.includes('offscreen') ? {} : undefined,
            zustand: integrations.includes('zustand') ? {} : undefined,
            koota: integrations.includes('koota') ? {} : undefined,
            triplex: integrations.includes('triplex') ? {} : undefined,
            viverse: integrations.includes('viverse') ? {} : undefined,
        };
    }

    return base;
}

/**
 * Prompts for initial package in a monorepo.
 */
export async function promptForInitialPackage(): Promise<'app' | 'library' | 'skip'> {
    const choice = await p.select({
        message: 'Add an initial package?',
        options: [
            { value: 'app', label: 'Application' },
            { value: 'library', label: 'Library' },
            { value: 'skip', label: 'Skip' },
        ],
        initialValue: 'app',
    });

    if (p.isCancel(choice)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    return choice as 'app' | 'library' | 'skip';
}

/**
 * Gets default options for a monorepo workspace.
 */
export function getDefaultMonorepoOptions(name: string): GenerateOptions {
    return {
        name,
        projectType: 'monorepo',
        packageManager: { name: 'pnpm' },
        pnpmManageVersions: true,
        engine: { name: 'node', version: 'latest' },
        linter: 'oxlint',
        formatter: 'prettier',
        ide: 'vscode',
    };
}

/**
 * Prompts for monorepo customization.
 */
async function promptForMonorepoCustomization(
    name: string,
    presets?: CliPresets
): Promise<GenerateOptions> {
    const nodeVersion = await p.text({
        message: 'Node.js version',
        placeholder: presets?.engine?.version ?? 'latest',
        defaultValue: presets?.engine?.version ?? 'latest',
        validate: (value) => {
            if (!value.length) return 'Required';
            if (value !== 'latest' && !/^\d+(\.\d+(\.\d+)?)?$/.test(value)) {
                return 'Must be "latest" or a valid semver (e.g., "22" or "22.13.0")';
            }
        },
    });

    if (p.isCancel(nodeVersion)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    // Monorepos are currently pnpm-only
    // TODO: Support yarn and npm workspaces in the future
    const managePnpm = await p.confirm({
        message: 'Enable manage-package-manager-versions?',
        initialValue: presets?.pnpmManageVersions ?? true,
    });
    if (p.isCancel(managePnpm)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    const linter = await p.select({
        message: 'Linter',
        options: [
            { value: 'oxlint', label: 'Oxlint', hint: 'fast, from OXC' },
            { value: 'eslint', label: 'ESLint', hint: 'classic' },
            { value: 'biome', label: 'Biome', hint: 'all-in-one' },
        ],
        initialValue: presets?.linter ?? 'oxlint',
    });

    if (p.isCancel(linter)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    const formatter = await p.select({
        message: 'Formatter',
        options: [
            { value: 'prettier', label: 'Prettier', hint: 'widely adopted' },
            { value: 'oxfmt', label: 'Oxfmt', hint: 'fast, Prettier-compatible' },
            { value: 'biome', label: 'Biome', hint: 'all-in-one' },
        ],
        initialValue: presets?.formatter ?? 'prettier',
    });

    if (p.isCancel(formatter)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    const ide = await p.select({
        message: 'IDE config',
        options: [
            { value: 'vscode', label: 'vscode' },
            { value: 'none', label: 'None' },
        ],
        initialValue: presets?.ide ?? 'vscode',
    });

    if (p.isCancel(ide)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    return {
        name,
        projectType: 'monorepo',
        engine: { name: 'node', version: nodeVersion },
        packageManager: { name: 'pnpm' },
        pnpmManageVersions: managePnpm,
        linter: linter as 'eslint' | 'oxlint' | 'biome',
        formatter: formatter as 'prettier' | 'oxfmt' | 'biome',
        ide: ide as Ide,
    };
}

/**
 * Main prompt flow for creating a monorepo workspace.
 */
async function promptForMonorepo(
    workspaceName: string,
    presets?: CliPresets
): Promise<GenerateOptions> {
    const defaultOptions = getDefaultMonorepoOptions(workspaceName);

    // Apply presets to defaults
    if (presets) {
        if (presets.linter) defaultOptions.linter = presets.linter;
        if (presets.formatter) defaultOptions.formatter = presets.formatter;
        if (presets.ide) defaultOptions.ide = presets.ide;
        if (presets.engine) defaultOptions.engine = presets.engine;
        if (presets.pnpmManageVersions !== undefined)
            defaultOptions.pnpmManageVersions = presets.pnpmManageVersions;
    }

    // Show summary and ask confirm/customize
    p.note(
        formatMonorepoConfigSummary({
            name: defaultOptions.name,
            engine: defaultOptions.engine ?? { name: 'node', version: 'latest' },
            packageManager: getPackageManagerName(defaultOptions.packageManager),
            pnpmManageVersions: defaultOptions.pnpmManageVersions,
            linter: defaultOptions.linter ?? 'oxlint',
            formatter: defaultOptions.formatter ?? 'prettier',
            ide: defaultOptions.ide ?? 'vscode',
        }),
        'Workspace Configuration'
    );

    const proceed = await p.select({
        message: 'Proceed with these settings?',
        options: [
            { value: 'continue', label: 'Yes, continue' },
            { value: 'customize', label: 'No, customize settings' },
        ],
        initialValue: 'continue',
    });

    if (p.isCancel(proceed)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    if (proceed === 'continue') {
        return defaultOptions;
    }

    return promptForMonorepoCustomization(workspaceName, presets);
}

/**
 * Main prompt flow for gathering project options.
 * When presets are provided, they pre-fill prompt defaults.
 */
export async function promptForOptions(
    name: string | undefined,
    presets?: CliPresets
): Promise<GenerateOptions> {
    // Step 1: Project Name (if not provided via argument)
    let projectName = name;
    if (!projectName) {
        const nameResult = await p.text({
            message: 'What is your project named?',
            placeholder: generateRandomName(),
            defaultValue: generateRandomName(),
            validate: (value) => {
                if (!value.length) return 'Project name is required';
            },
        });
        if (p.isCancel(nameResult)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }
        projectName = nameResult;
    }

    // Step 2: Select project type (app, library, or monorepo)
    const projectType = await p.select({
        message: 'Project type',
        options: [
            { value: 'app', label: 'Application' },
            { value: 'library', label: 'Library' },
            { value: 'monorepo', label: 'Monorepo', hint: 'experimental' },
        ],
        initialValue: presets?.type ?? 'app',
    });

    if (p.isCancel(projectType)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    // If monorepo, handle differently
    if (projectType === 'monorepo') {
        return promptForMonorepo(projectName, presets);
    }

    return promptForPackageOptions(projectName, projectType as 'app' | 'library', undefined, presets);
}

/**
 * Converts a custom template to GenerateOptions.
 */
function customTemplateToOptions(
    customTemplate: CustomTemplate,
    name: string,
    projectType: 'app' | 'library',
    inheritedSettings?: InheritedWorkspaceSettings
): GenerateOptions {
    const baseTemplate = customTemplate.baseTemplate;
    const template: Template = baseTemplate; // TypeScript by default for custom templates

    const base: GenerateOptions = {
        name,
        template,
        projectType,
        packageManager: inheritedSettings?.packageManager ?? { name: 'pnpm' },
        pnpmManageVersions: inheritedSettings?.pnpmManageVersions ?? true,
        engine: inheritedSettings?.engine ?? { name: 'node', version: 'latest' },
        linter: inheritedSettings?.linter ?? customTemplate.linter,
        formatter: inheritedSettings?.formatter ?? customTemplate.formatter,
        testing: customTemplate.testing,
        configStrategy: customTemplate.configStrategy ?? getConfigStrategy(),
        ide: customTemplate.ide ?? 'vscode',
    };

    if (baseTemplate === 'r3f' && customTemplate.integrations) {
        const integrations = customTemplate.integrations;
        return {
            ...base,
            drei: integrations.includes('drei') ? {} : undefined,
            handle: integrations.includes('handle') ? {} : undefined,
            leva: integrations.includes('leva') ? {} : undefined,
            postprocessing: integrations.includes('postprocessing') ? {} : undefined,
            rapier: integrations.includes('rapier') ? {} : undefined,
            xr: integrations.includes('xr') ? {} : undefined,
            uikit: integrations.includes('uikit') ? {} : undefined,
            offscreen: integrations.includes('offscreen') ? {} : undefined,
            zustand: integrations.includes('zustand') ? {} : undefined,
            koota: integrations.includes('koota') ? {} : undefined,
            triplex: integrations.includes('triplex') ? {} : undefined,
            viverse: integrations.includes('viverse') ? {} : undefined,
        };
    }

    return base;
}

export type InheritedWorkspaceSettings = {
    linter?: 'oxlint' | 'eslint' | 'biome';
    formatter?: 'oxfmt' | 'prettier' | 'biome';
    packageManager?: PackageManagerSpec;
    engine?: EngineSpec;
    pnpmManageVersions?: boolean;
};

/**
 * CLI-provided presets that pre-fill prompt defaults.
 * These are used when flags are passed but --yes is not.
 */
export type CliPresets = {
    type?: 'app' | 'library' | 'monorepo';
    template?: Template;
    bundler?: 'unbuild' | 'tsdown';
    linter?: 'oxlint' | 'eslint' | 'biome';
    formatter?: 'oxfmt' | 'prettier' | 'biome';
    packageManager?: PackageManagerName;
    engine?: EngineSpec;
    pnpmManageVersions?: boolean;
    ide?: Ide;
    // R3F integrations
    drei?: boolean;
    handle?: boolean;
    leva?: boolean;
    postprocessing?: boolean;
    rapier?: boolean;
    xr?: boolean;
    uikit?: boolean;
    offscreen?: boolean;
    zustand?: boolean;
    koota?: boolean;
    triplex?: boolean;
    viverse?: boolean;
};

/**
 * Converts CLI presets to inherited settings format for getDefaultOptions.
 */
function presetsToInheritedSettings(presets?: CliPresets): InheritedWorkspaceSettings | undefined {
    if (!presets) return undefined;
    return {
        linter: presets.linter,
        formatter: presets.formatter,
        packageManager: presets.packageManager ? { name: presets.packageManager } : undefined,
        engine: presets.engine,
        pnpmManageVersions: presets.pnpmManageVersions,
    };
}

/**
 * Prompt flow for package options when project type is already known.
 * Used when adding packages to a monorepo.
 * When inheritedSettings is provided, workspace-level setting prompts are skipped.
 * When presets are provided, they pre-fill prompt defaults.
 */
export async function promptForPackageOptions(
    projectName: string,
    projectType: 'app' | 'library',
    inheritedSettings?: InheritedWorkspaceSettings,
    presets?: CliPresets
): Promise<GenerateOptions> {
    // Build template options including custom templates
    const builtInOptions = [
        { value: 'vanilla', label: 'Vanilla' },
        { value: 'react', label: 'React', hint: 'experimental' },
        { value: 'r3f', label: 'React Three Fiber', hint: 'experimental' },
    ];

    const customTemplates = getCustomTemplates();
    const customOptions = Object.keys(customTemplates).map((name) => ({
        value: `custom:${name}`,
        label: name,
        hint: 'saved template',
    }));

    const allOptions = [...builtInOptions, ...customOptions];

    // Select template (TypeScript by default, customize for JavaScript)
    const templateSelection = await p.select({
        message: 'Select a template',
        options: allOptions,
        initialValue: presets?.template ?? 'vanilla',
    });

    if (p.isCancel(templateSelection)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    const selection = templateSelection as string;

    // Handle custom template selection
    if (selection.startsWith('custom:')) {
        const customName = selection.slice(7); // Remove "custom:" prefix
        const customTemplate = customTemplates[customName]!;
        const defaultOptions = customTemplateToOptions(
            customTemplate,
            projectName,
            projectType,
            inheritedSettings
        );

        // Show summary and ask confirm/customize
        const configTitle = inheritedSettings
            ? `Template: ${customName} (using workspace settings)`
            : `Template: ${customName}`;
        p.note(formatConfigSummary(defaultOptions, inheritedSettings), configTitle);

        const proceed = await p.select({
            message: 'Proceed with these settings?',
            options: [
                { value: 'continue', label: 'Yes, continue' },
                { value: 'customize', label: 'No, customize settings' },
            ],
            initialValue: 'continue',
        });

        if (p.isCancel(proceed)) {
            p.cancel('Operation cancelled.');
            process.exit(0);
        }

        if (proceed === 'continue') {
            return defaultOptions;
        }

        // Customize starting from the custom template's base (preserve integrations)
        return promptForCustomization(
            customTemplate.baseTemplate as Template,
            projectName,
            projectType,
            customTemplate.integrations,
            inheritedSettings,
            {
                ...presets,
                ide: customTemplate.ide,
            }
        );
    }

    // Handle built-in template selection
    const template = selection as Template;
    const baseTemplate = getBaseTemplate(template);

    // For R3F, immediately prompt for integrations
    let integrations: string[] | undefined;
    if (baseTemplate === 'r3f') {
        integrations = await promptForR3fIntegrations(presets);
    }

    const defaultOptions = getDefaultOptions(
        template,
        projectName,
        projectType,
        presets?.bundler,
        integrations,
        inheritedSettings ?? presetsToInheritedSettings(presets)
    );
    if (presets?.ide && !inheritedSettings) {
        defaultOptions.ide = presets.ide;
    }

    // Show summary and ask confirm/customize
    const configTitle = inheritedSettings
        ? 'Template Configuration (using workspace settings)'
        : 'Template Configuration';
    p.note(formatConfigSummary(defaultOptions, inheritedSettings), configTitle);

    const proceed = await p.select({
        message: 'Proceed with these settings?',
        options: [
            { value: 'continue', label: 'Yes, continue' },
            { value: 'customize', label: 'No, customize settings' },
        ],
        initialValue: 'continue',
    });

    if (p.isCancel(proceed)) {
        p.cancel('Operation cancelled.');
        process.exit(0);
    }

    if (proceed === 'continue') {
        return defaultOptions;
    }

    // Customize (pass integrations for R3F so they're preserved)
    return promptForCustomization(
        template,
        projectName,
        projectType,
        integrations,
        inheritedSettings,
        presets
    );
}
