import * as p from "@clack/prompts";
import { getCustomTemplates, type CustomTemplate } from "../config.js";
import type { GenerateOptions, LibraryBundler, ProjectType, Template } from "../types.js";
import { getBaseTemplate } from "../types.js";
import { generateRandomName } from "../utils.js";
import { formatConfigSummary, formatMonorepoConfigSummary } from "./format.js";

/**
 * Gets default options for a given template and project type.
 * For R3F templates, pass integrations array to specify which integrations to include.
 * When inheritedSettings is provided, uses those values instead of defaults.
 */
export function getDefaultOptions(
  template: Template,
  name: string,
  projectType: ProjectType = "app",
  libraryBundler?: LibraryBundler,
  integrations?: string[],
  inheritedSettings?: InheritedWorkspaceSettings,
): GenerateOptions {
  const baseTemplate = getBaseTemplate(template);
  const base: GenerateOptions = {
    name,
    template,
    projectType,
    libraryBundler: projectType === "library" ? (libraryBundler ?? "unbuild") : undefined,
    packageManager: inheritedSettings?.packageManager ?? "pnpm",
    pnpmManageVersions: inheritedSettings?.pnpmManageVersions ?? true,
    nodeVersion: inheritedSettings?.nodeVersion ?? "latest",
    linter: inheritedSettings?.linter ?? "oxlint",
    formatter: inheritedSettings?.formatter ?? "oxfmt",
    // Libraries get vitest by default, apps don't
    testing: projectType === "library" ? "vitest" : "none",
  };

  if (baseTemplate === "r3f" && integrations) {
    return {
      ...base,
      drei: integrations.includes("drei") ? {} : undefined,
      handle: integrations.includes("handle") ? {} : undefined,
      leva: integrations.includes("leva") ? {} : undefined,
      postprocessing: integrations.includes("postprocessing") ? {} : undefined,
      rapier: integrations.includes("rapier") ? {} : undefined,
      xr: integrations.includes("xr") ? {} : undefined,
      uikit: integrations.includes("uikit") ? {} : undefined,
      offscreen: integrations.includes("offscreen") ? {} : undefined,
      zustand: integrations.includes("zustand") ? {} : undefined,
      koota: integrations.includes("koota") ? {} : undefined,
      triplex: integrations.includes("triplex") ? {} : undefined,
      viverse: integrations.includes("viverse") ? {} : undefined,
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
    case "vanilla":
      return `vanilla-${generateRandomName()}`;
    case "react":
      return `react-${generateRandomName()}`;
    case "r3f":
      return `react-three-${generateRandomName()}`;
  }
}

/**
 * Prompts for R3F integrations selection.
 */
async function promptForR3fIntegrations(): Promise<string[]> {
  const selected = await p.multiselect({
    message: "R3F integrations",
    options: [
      { value: "drei", label: "Drei" },
      { value: "handle", label: "Handle" },
      { value: "leva", label: "Leva" },
      { value: "postprocessing", label: "Postprocessing" },
      { value: "rapier", label: "Rapier" },
      { value: "xr", label: "XR" },
      { value: "uikit", label: "UIKit" },
      { value: "offscreen", label: "Offscreen" },
      { value: "zustand", label: "Zustand" },
      { value: "koota", label: "Koota" },
      { value: "triplex", label: "Triplex" },
      { value: "viverse", label: "Viverse" },
    ],
    initialValues: ["drei"],
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  return selected as string[];
}

/**
 * Prompts user for customization options.
 * For R3F templates, integrations should be passed in (already selected upfront).
 * When inheritedSettings is provided, workspace-level settings are skipped.
 */
export async function promptForCustomization(
  template: Template,
  name: string,
  projectType: ProjectType,
  integrations?: string[],
  inheritedSettings?: InheritedWorkspaceSettings,
): Promise<GenerateOptions> {
  // Library bundler selection (only for libraries)
  let libraryBundler: LibraryBundler | undefined;
  if (projectType === "library") {
    const bundler = await p.select({
      message: "Library bundler",
      options: [
        { value: "unbuild", label: "unbuild", hint: "unjs, simple config" },
        { value: "tsdown", label: "tsdown", hint: "fast, esbuild-based" },
      ],
      initialValue: "unbuild",
    });

    if (p.isCancel(bundler)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    libraryBundler = bundler as LibraryBundler;
  }

  // Skip workspace-level settings if inherited from workspace
  let nodeVersion: string = inheritedSettings?.nodeVersion ?? "latest";
  let finalPackageManager: string = inheritedSettings?.packageManager ?? "pnpm";
  let pnpmManageVersions: boolean = inheritedSettings?.pnpmManageVersions ?? true;

  if (!inheritedSettings?.nodeVersion) {
    const nodeVersionInput = await p.text({
      message: "Node.js version",
      placeholder: "latest",
      defaultValue: "latest",
      validate: (value) => {
        if (!value.length) return "Required";
        if (value !== "latest" && !/^\d+(\.\d+(\.\d+)?)?$/.test(value)) {
          return 'Must be "latest" or a valid semver (e.g., "22" or "22.13.0")';
        }
      },
    });

    if (p.isCancel(nodeVersionInput)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    nodeVersion = nodeVersionInput;
  }

  if (!inheritedSettings?.packageManager) {
    const packageManager = await p.select({
      message: "Package manager",
      options: [
        { value: "pnpm", label: "pnpm" },
        { value: "npm", label: "npm" },
        { value: "yarn", label: "yarn" },
        { value: "custom", label: "Other (custom)" },
      ],
      initialValue: "pnpm",
    });

    if (p.isCancel(packageManager)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    finalPackageManager = packageManager as string;
    if (packageManager === "custom") {
      const customPm = await p.text({
        message: "Enter package manager command",
        validate: (value) => {
          if (!value.length) return "Required";
        },
      });
      if (p.isCancel(customPm)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }
      finalPackageManager = customPm;
    }

    if (packageManager === "pnpm") {
      const managePnpm = await p.confirm({
        message: "Enable manage-package-manager-versions?",
        initialValue: true,
      });
      if (p.isCancel(managePnpm)) {
        p.cancel("Operation cancelled.");
        process.exit(0);
      }
      pnpmManageVersions = managePnpm;
    }
  }

  // Skip linter/formatter prompts if inherited from workspace
  let linter: "oxlint" | "eslint" | "biome" = inheritedSettings?.linter ?? "oxlint";
  let formatter: "oxfmt" | "prettier" | "biome" = inheritedSettings?.formatter ?? "oxfmt";

  if (!inheritedSettings?.linter) {
    const linterChoice = await p.select({
      message: "Linter",
      options: [
        { value: "oxlint", label: "Oxlint", hint: "fast, from OXC" },
        { value: "eslint", label: "ESLint", hint: "classic" },
        { value: "biome", label: "Biome", hint: "all-in-one" },
      ],
      initialValue: "oxlint",
    });

    if (p.isCancel(linterChoice)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    linter = linterChoice as "oxlint" | "eslint" | "biome";
  }

  if (!inheritedSettings?.formatter) {
    const formatterChoice = await p.select({
      message: "Formatter",
      options: [
        { value: "oxfmt", label: "Oxfmt", hint: "fast, Prettier-compatible" },
        { value: "prettier", label: "Prettier", hint: "classic" },
        { value: "biome", label: "Biome", hint: "all-in-one" },
      ],
      initialValue: "oxfmt",
    });

    if (p.isCancel(formatterChoice)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    formatter = formatterChoice as "oxfmt" | "prettier" | "biome";
  }

  // Testing - default to vitest for libraries, none for apps
  const testing = await p.select({
    message: "Testing",
    options: [
      { value: "vitest", label: "Vitest", hint: "fast, Vite-native" },
      { value: "none", label: "None" },
    ],
    initialValue: projectType === "library" ? "vitest" : "none",
  });

  if (p.isCancel(testing)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const language = await p.select({
    message: "Language",
    options: [
      { value: "typescript", label: "TypeScript" },
      { value: "javascript", label: "JavaScript" },
    ],
    initialValue: "typescript",
  });

  if (p.isCancel(language)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Derive final template based on language selection
  const baseTemplate = getBaseTemplate(template);
  const finalTemplate: Template =
    language === "javascript" ? (`${baseTemplate}-js` as Template) : (baseTemplate as Template);

  const base: GenerateOptions = {
    name,
    template: finalTemplate,
    projectType,
    libraryBundler: projectType === "library" ? libraryBundler : undefined,
    nodeVersion,
    packageManager: finalPackageManager,
    pnpmManageVersions,
    linter,
    formatter,
    testing: testing as "vitest" | "none",
  };

  // For R3F, use the integrations passed in (already selected upfront)
  if (baseTemplate === "r3f" && integrations) {
    return {
      ...base,
      drei: integrations.includes("drei") ? {} : undefined,
      handle: integrations.includes("handle") ? {} : undefined,
      leva: integrations.includes("leva") ? {} : undefined,
      postprocessing: integrations.includes("postprocessing") ? {} : undefined,
      rapier: integrations.includes("rapier") ? {} : undefined,
      xr: integrations.includes("xr") ? {} : undefined,
      uikit: integrations.includes("uikit") ? {} : undefined,
      offscreen: integrations.includes("offscreen") ? {} : undefined,
      zustand: integrations.includes("zustand") ? {} : undefined,
      koota: integrations.includes("koota") ? {} : undefined,
      triplex: integrations.includes("triplex") ? {} : undefined,
      viverse: integrations.includes("viverse") ? {} : undefined,
    };
  }

  return base;
}

/**
 * Prompts for initial package in a monorepo.
 */
export async function promptForInitialPackage(): Promise<"app" | "library" | "skip"> {
  const choice = await p.select({
    message: "Add an initial package?",
    options: [
      { value: "app", label: "Application" },
      { value: "library", label: "Library" },
      { value: "skip", label: "Skip" },
    ],
    initialValue: "app",
  });

  if (p.isCancel(choice)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  return choice as "app" | "library" | "skip";
}

/**
 * Gets default options for a monorepo workspace.
 */
export function getDefaultMonorepoOptions(name: string): GenerateOptions {
  return {
    name,
    projectType: "monorepo",
    packageManager: "pnpm",
    pnpmManageVersions: true,
    nodeVersion: "latest",
    linter: "oxlint",
    formatter: "oxfmt",
  };
}

/**
 * Prompts for monorepo customization.
 */
async function promptForMonorepoCustomization(name: string): Promise<GenerateOptions> {
  const nodeVersion = await p.text({
    message: "Node.js version",
    placeholder: "latest",
    defaultValue: "latest",
    validate: (value) => {
      if (!value.length) return "Required";
      if (value !== "latest" && !/^\d+(\.\d+(\.\d+)?)?$/.test(value)) {
        return 'Must be "latest" or a valid semver (e.g., "22" or "22.13.0")';
      }
    },
  });

  if (p.isCancel(nodeVersion)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Monorepos are currently pnpm-only
  // TODO: Support yarn and npm workspaces in the future
  const managePnpm = await p.confirm({
    message: "Enable manage-package-manager-versions?",
    initialValue: true,
  });
  if (p.isCancel(managePnpm)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const linter = await p.select({
    message: "Linter",
    options: [
      { value: "oxlint", label: "Oxlint", hint: "fast, from OXC" },
      { value: "eslint", label: "ESLint", hint: "classic" },
      { value: "biome", label: "Biome", hint: "all-in-one" },
    ],
    initialValue: "oxlint",
  });

  if (p.isCancel(linter)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const formatter = await p.select({
    message: "Formatter",
    options: [
      { value: "oxfmt", label: "Oxfmt", hint: "fast, Prettier-compatible" },
      { value: "prettier", label: "Prettier", hint: "classic" },
      { value: "biome", label: "Biome", hint: "all-in-one" },
    ],
    initialValue: "oxfmt",
  });

  if (p.isCancel(formatter)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  return {
    name,
    projectType: "monorepo",
    nodeVersion,
    packageManager: "pnpm",
    pnpmManageVersions: managePnpm,
    linter: linter as "eslint" | "oxlint" | "biome",
    formatter: formatter as "prettier" | "oxfmt" | "biome",
  };
}

/**
 * Main prompt flow for creating a monorepo workspace.
 */
async function promptForMonorepo(workspaceName: string): Promise<GenerateOptions> {
  const defaultOptions = getDefaultMonorepoOptions(workspaceName);

  // Show summary and ask confirm/customize
  p.note(
    formatMonorepoConfigSummary({
      name: defaultOptions.name,
      nodeVersion: defaultOptions.nodeVersion ?? "latest",
      packageManager: defaultOptions.packageManager ?? "pnpm",
      pnpmManageVersions: defaultOptions.pnpmManageVersions,
      linter: defaultOptions.linter ?? "oxlint",
      formatter: defaultOptions.formatter ?? "oxfmt",
    }),
    "Workspace Configuration",
  );

  const proceed = await p.confirm({
    message: "Proceed with these settings?",
    initialValue: true,
  });

  if (p.isCancel(proceed)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (proceed) {
    return defaultOptions;
  }

  return promptForMonorepoCustomization(workspaceName);
}

/**
 * Main prompt flow for gathering project options.
 */
export async function promptForOptions(name: string | undefined): Promise<GenerateOptions> {
  // Step 1: Project Name (if not provided via argument)
  let projectName = name;
  if (!projectName) {
    const nameResult = await p.text({
      message: "What is your project named?",
      placeholder: generateRandomName(),
      defaultValue: generateRandomName(),
      validate: (value) => {
        if (!value.length) return "Project name is required";
      },
    });
    if (p.isCancel(nameResult)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    projectName = nameResult;
  }

  // Step 2: Select project type (app, library, or monorepo)
  const projectType = await p.select({
    message: "Project type",
    options: [
      { value: "app", label: "Application" },
      { value: "library", label: "Library" },
      { value: "monorepo", label: "Monorepo" },
    ],
    initialValue: "app",
  });

  if (p.isCancel(projectType)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // If monorepo, handle differently
  if (projectType === "monorepo") {
    return promptForMonorepo(projectName);
  }

  return promptForPackageOptions(projectName, projectType as "app" | "library");
}

/**
 * Converts a custom template to GenerateOptions.
 */
function customTemplateToOptions(
  customTemplate: CustomTemplate,
  name: string,
  projectType: "app" | "library",
  inheritedSettings?: InheritedWorkspaceSettings,
): GenerateOptions {
  const baseTemplate = customTemplate.baseTemplate;
  const template: Template = baseTemplate; // TypeScript by default for custom templates

  const base: GenerateOptions = {
    name,
    template,
    projectType,
    packageManager: inheritedSettings?.packageManager ?? "pnpm",
    pnpmManageVersions: inheritedSettings?.pnpmManageVersions ?? true,
    nodeVersion: inheritedSettings?.nodeVersion ?? "latest",
    linter: inheritedSettings?.linter ?? customTemplate.linter,
    formatter: inheritedSettings?.formatter ?? customTemplate.formatter,
    testing: customTemplate.testing,
  };

  if (baseTemplate === "r3f" && customTemplate.integrations) {
    const integrations = customTemplate.integrations;
    return {
      ...base,
      drei: integrations.includes("drei") ? {} : undefined,
      handle: integrations.includes("handle") ? {} : undefined,
      leva: integrations.includes("leva") ? {} : undefined,
      postprocessing: integrations.includes("postprocessing") ? {} : undefined,
      rapier: integrations.includes("rapier") ? {} : undefined,
      xr: integrations.includes("xr") ? {} : undefined,
      uikit: integrations.includes("uikit") ? {} : undefined,
      offscreen: integrations.includes("offscreen") ? {} : undefined,
      zustand: integrations.includes("zustand") ? {} : undefined,
      koota: integrations.includes("koota") ? {} : undefined,
      triplex: integrations.includes("triplex") ? {} : undefined,
      viverse: integrations.includes("viverse") ? {} : undefined,
    };
  }

  return base;
}

export type InheritedWorkspaceSettings = {
  linter?: "oxlint" | "eslint" | "biome";
  formatter?: "oxfmt" | "prettier" | "biome";
  packageManager?: string;
  nodeVersion?: string;
  pnpmManageVersions?: boolean;
};

/**
 * Prompt flow for package options when project type is already known.
 * Used when adding packages to a monorepo.
 * When inheritedSettings is provided, workspace-level setting prompts are skipped.
 */
export async function promptForPackageOptions(
  projectName: string,
  projectType: "app" | "library",
  inheritedSettings?: InheritedWorkspaceSettings,
): Promise<GenerateOptions> {
  // Build template options including custom templates
  const builtInOptions = [
    { value: "vanilla", label: "Vanilla" },
    { value: "react", label: "React" },
    { value: "r3f", label: "React Three Fiber" },
  ];

  const customTemplates = getCustomTemplates();
  const customOptions = Object.keys(customTemplates).map((name) => ({
    value: `custom:${name}`,
    label: name,
    hint: "saved template",
  }));

  const allOptions = [...builtInOptions, ...customOptions];

  // Select template (TypeScript by default, customize for JavaScript)
  const templateSelection = await p.select({
    message: "Select a template",
    options: allOptions,
    initialValue: "vanilla",
  });

  if (p.isCancel(templateSelection)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const selection = templateSelection as string;

  // Handle custom template selection
  if (selection.startsWith("custom:")) {
    const customName = selection.slice(7); // Remove "custom:" prefix
    const customTemplate = customTemplates[customName]!;
    const defaultOptions = customTemplateToOptions(
      customTemplate,
      projectName,
      projectType,
      inheritedSettings,
    );

    // Show summary and ask confirm/customize
    const configTitle = inheritedSettings
      ? `Template: ${customName} (using workspace settings)`
      : `Template: ${customName}`;
    p.note(formatConfigSummary(defaultOptions, inheritedSettings), configTitle);

    const proceed = await p.confirm({
      message: "Proceed with these settings?",
      initialValue: true,
    });

    if (p.isCancel(proceed)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    if (proceed) {
      return defaultOptions;
    }

    // Customize starting from the custom template's base (preserve integrations)
    return promptForCustomization(
      customTemplate.baseTemplate as Template,
      projectName,
      projectType,
      customTemplate.integrations,
      inheritedSettings,
    );
  }

  // Handle built-in template selection
  const template = selection as Template;
  const baseTemplate = getBaseTemplate(template);

  // For R3F, immediately prompt for integrations
  let integrations: string[] | undefined;
  if (baseTemplate === "r3f") {
    integrations = await promptForR3fIntegrations();
  }

  const defaultOptions = getDefaultOptions(
    template,
    projectName,
    projectType,
    undefined,
    integrations,
    inheritedSettings,
  );

  // Show summary and ask confirm/customize
  const configTitle = inheritedSettings
    ? "Template Configuration (using workspace settings)"
    : "Template Configuration";
  p.note(formatConfigSummary(defaultOptions, inheritedSettings), configTitle);

  const proceed = await p.confirm({
    message: "Proceed with these settings?",
    initialValue: true,
  });

  if (p.isCancel(proceed)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (proceed) {
    return defaultOptions;
  }

  // Customize (pass integrations for R3F so they're preserved)
  return promptForCustomization(template, projectName, projectType, integrations, inheritedSettings);
}
