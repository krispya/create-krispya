import * as p from "@clack/prompts";
import type { GenerateOptions, LibraryBundler, ProjectType, Template } from "../types.js";
import { getBaseTemplate } from "../types.js";
import { generateRandomName } from "../utils.js";
import { formatConfigSummary, formatMonorepoConfigSummary } from "./format.js";

/**
 * Gets default options for a given template and project type.
 */
export function getDefaultOptions(
  template: Template,
  name: string,
  projectType: ProjectType = "app",
  libraryBundler?: LibraryBundler,
): GenerateOptions {
  const baseTemplate = getBaseTemplate(template);
  const base: GenerateOptions = {
    name,
    template,
    projectType,
    libraryBundler: projectType === "library" ? (libraryBundler ?? "unbuild") : undefined,
    packageManager: "pnpm",
    pnpmManageVersions: true,
    nodeVersion: "latest",
    linter: "oxlint",
    formatter: "oxfmt",
    // Libraries get vitest by default, apps don't
    testing: projectType === "library" ? "vitest" : "none",
  };

  if (baseTemplate === "r3f") {
    return {
      ...base,
      drei: {},
      handle: {},
      leva: {},
      postprocessing: {},
      rapier: {},
      xr: {},
      uikit: {},
      offscreen: {},
      zustand: {},
      koota: {},
      triplex: {},
      viverse: {},
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
 * Prompts user for customization options.
 */
export async function promptForCustomization(
  template: Template,
  name: string,
  projectType: ProjectType,
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

  let finalPackageManager = packageManager as string;
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

  let pnpmManageVersions = true;
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

  let integrations: string[] = [];
  if (baseTemplate === "r3f") {
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
      initialValues: [
        "drei",
        "handle",
        "leva",
        "postprocessing",
        "rapier",
        "xr",
        "uikit",
        "offscreen",
        "zustand",
        "koota",
        "triplex",
        "viverse",
      ],
      required: false,
    });
    if (p.isCancel(selected)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
    integrations = selected as string[];
  }

  return {
    name,
    template: finalTemplate,
    projectType,
    libraryBundler: projectType === "library" ? libraryBundler : undefined,
    nodeVersion,
    packageManager: finalPackageManager,
    pnpmManageVersions,
    linter: linter as "eslint" | "oxlint" | "biome",
    formatter: formatter as "prettier" | "oxfmt" | "biome",
    testing: testing as "vitest" | "none",
    ...(baseTemplate === "r3f" && {
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
    }),
  };
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

  const packageManager = await p.select({
    message: "Package manager",
    options: [
      { value: "pnpm", label: "pnpm" },
      { value: "npm", label: "npm" },
      { value: "yarn", label: "yarn" },
    ],
    initialValue: "pnpm",
  });

  if (p.isCancel(packageManager)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  let pnpmManageVersions = true;
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
    packageManager: packageManager as string,
    pnpmManageVersions,
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

  const action = await p.select({
    message: "Proceed with these settings?",
    options: [
      { value: "confirm", label: "Yes, create workspace" },
      { value: "customize", label: "No, let me customize" },
    ],
    initialValue: "confirm",
  });

  if (p.isCancel(action)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (action === "confirm") {
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
 * Prompt flow for package options when project type is already known.
 * Used when adding packages to a monorepo.
 */
export async function promptForPackageOptions(
  projectName: string,
  projectType: "app" | "library",
): Promise<GenerateOptions> {
  // Select template (TypeScript by default, customize for JavaScript)
  const template = await p.select({
    message: "Select a template",
    options: [
      { value: "vanilla", label: "Vanilla" },
      { value: "react", label: "React" },
      { value: "r3f", label: "React Three Fiber" },
    ],
    initialValue: "vanilla",
  });

  if (p.isCancel(template)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  const defaultOptions = getDefaultOptions(template as Template, projectName, projectType);

  // Show summary and ask confirm/customize
  p.note(formatConfigSummary(defaultOptions), "Template Configuration");

  const action = await p.select({
    message: "Proceed with these settings?",
    options: [
      { value: "confirm", label: "Yes, create project" },
      { value: "customize", label: "No, let me customize" },
    ],
    initialValue: "confirm",
  });

  if (p.isCancel(action)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  if (action === "confirm") {
    return defaultOptions;
  }

  // Customize
  return promptForCustomization(template as Template, projectName, projectType);
}
