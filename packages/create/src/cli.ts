#!/usr/bin/env node
import { createRequire } from "module";
import { cwd } from "process";
import {
  generate,
  GenerateOptions,
  generateRandomName,
  getBaseTemplate,
  getLanguageFromTemplate,
  getLatestPnpmVersion,
  LibraryBundler,
  PackageVersions,
  ProjectType,
  Template,
} from "./index.js";
import { getLatestNodeVersion, getLatestNpmVersion } from "./utils.js";
import { dirname, join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { Command } from "commander";
import * as p from "@clack/prompts";
import color from "chalk";
import { fetch } from "undici";
import { spawn } from "child_process";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

function getDefaultProjectName(template: Template): string {
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

function getDefaultOptions(
  template: Template,
  name: string,
  projectType: ProjectType = "app",
  libraryBundler?: LibraryBundler
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

function formatConfigSummary(options: GenerateOptions): string {
  const lines: string[] = [];
  const VALUE_COL = 27; // Start position for values

  const formatRow = (label: string, value: string, indent = "") => {
    const fullLabel = indent + label;
    const dotCount = Math.max(1, VALUE_COL - fullLabel.length - 1);
    const dots = color.gray(".".repeat(dotCount));
    return `${indent}${label} ${dots} ${value}`;
  };

  const formatLanguage = (lang: string) => {
    return lang === "typescript"
      ? "TypeScript"
      : lang === "javascript"
      ? "JavaScript"
      : lang;
  };

  // Language (derived from template)
  const projectType = options.projectType ?? "app";
  const language = options.template
    ? getLanguageFromTemplate(options.template)
    : "typescript";
  lines.push(formatRow("Language", formatLanguage(language)));

  // Bundler
  if (projectType === "library") {
    lines.push(formatRow("Bundler", options.libraryBundler ?? "unbuild"));
  } else {
    lines.push(formatRow("Bundler", "vite"));
  }

  // Node version
  lines.push(formatRow("Node version", options.nodeVersion || "latest"));

  // Package manager
  lines.push(formatRow("Package manager", options.packageManager || "pnpm"));

  // pnpm-specific options
  if (options.packageManager === "pnpm") {
    const versionManaged = options.pnpmManageVersions ? "yes" : "no";
    lines.push(formatRow("↳ Version managed", versionManaged, ""));
  }

  // Linter
  if (options.linter) {
    lines.push(formatRow("Linter", options.linter));
  }

  // Formatter
  if (options.formatter) {
    lines.push(formatRow("Formatter", options.formatter));
  }

  // Testing (always vitest)
  lines.push(formatRow("Testing", "vitest"));

  // R3F integrations
  if (options.template && getBaseTemplate(options.template) === "r3f") {
    const integrationNames = [
      options.drei && "drei",
      options.handle && "handle",
      options.leva && "leva",
      options.postprocessing && "postproc",
      options.rapier && "rapier",
      options.xr && "xr",
      options.uikit && "uikit",
      options.offscreen && "offscreen",
      options.zustand && "zustand",
      options.koota && "koota",
      options.triplex && "triplex",
      options.viverse && "viverse",
    ].filter(Boolean) as string[];

    lines.push("");
    lines.push(color.dim("Integrations"));

    // Two-column layout
    for (let i = 0; i < integrationNames.length; i += 2) {
      const left = `${color.green("●")} ${integrationNames[i]}`;
      const right = integrationNames[i + 1]
        ? `${color.green("●")} ${integrationNames[i + 1]}`
        : "";
      const spacing = " ".repeat(Math.max(1, 16 - integrationNames[i]!.length));
      lines.push(`  ${left}${spacing}${right}`);
    }
  }

  return lines.join("\n");
}

async function promptForCustomization(
  template: Template,
  name: string,
  projectType: ProjectType
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
    language === "javascript"
      ? (`${baseTemplate}-js` as Template)
      : (baseTemplate as Template);

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

async function promptForOptions(
  name: string | undefined
): Promise<GenerateOptions> {
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

  // Step 2: Select project type (app or library)
  const projectType = await p.select({
    message: "Project type",
    options: [
      { value: "app", label: "Application" },
      { value: "library", label: "Library" },
    ],
    initialValue: "app",
  });

  if (p.isCancel(projectType)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }

  // Step 3: Select template (TypeScript by default, customize for JavaScript)
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

  const defaultOptions = getDefaultOptions(
    template as Template,
    projectName,
    projectType as ProjectType
  );

  // Step 3: Show summary and ask confirm/customize
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

  // Step 5: Customize
  return promptForCustomization(
    template as Template,
    projectName,
    projectType as ProjectType
  );
}

interface CliOptions {
  type?: ProjectType;
  bundler?: LibraryBundler;
  template?: Template;
  linter?: "eslint" | "oxlint" | "biome";
  formatter?: "prettier" | "oxfmt" | "biome";
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
  pnpmManageVersions?: boolean;
  triplex?: boolean;
  viverse?: boolean;
  packageManager?: string;
  nodeVersion?: string;
  yes?: boolean;
}

function openInEditor(
  editor: "cursor" | "code" | "webstorm",
  path: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(editor, [path], {
      detached: true,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.unref();
    setTimeout(resolve, 100);
  });
}

async function main() {
  const program = new Command()
    .name("create-krispya")
    .description(
      "CLI for creating Vanilla, React, and React Three Fiber projects"
    )
    .argument("[name]", "name for the project")
    .option(
      "--type <type>",
      "project type: app or library (default: app)"
    )
    .option(
      "--bundler <bundler>",
      "library bundler: unbuild or tsdown (default: unbuild, only for libraries)"
    )
    .option(
      "--template <type>",
      "project template: vanilla, vanilla-js, react, react-js, r3f, r3f-js (default: vanilla)"
    )
    .option(
      "--linter <type>",
      "linter: eslint, oxlint, or biome (default: oxlint)"
    )
    .option(
      "--formatter <type>",
      "formatter: prettier, oxfmt, or biome (default: oxfmt)"
    )
    .option("--drei", "add @react-three/drei (r3f only)")
    .option("--handle", "add @react-three/handle (r3f only)")
    .option("--leva", "add leva (r3f only)")
    .option("--postprocessing", "add @react-three/postprocessing (r3f only)")
    .option("--rapier", "add @react-three/rapier (r3f only)")
    .option("--xr", "add @react-three/xr (r3f only)")
    .option("--uikit", "add @react-three/uikit (r3f only)")
    .option("--offscreen", "add @react-three/offscreen (r3f only)")
    .option("--zustand", "add zustand (r3f only)")
    .option("--koota", "add koota (r3f only)")
    .option("--triplex", "set up triplex development environment (r3f only)")
    .option("--viverse", "set up viverse deployment (r3f only)")
    .option(
      "--package-manager <manager>",
      "specify package manager (e.g. npm, yarn, pnpm)"
    )
    .option(
      "--pnpm-manage-versions",
      "enable manage-package-manager-versions in pnpm-workspace.yaml (default: true)"
    )
    .option(
      "--no-pnpm-manage-versions",
      "disable manage-package-manager-versions in pnpm-workspace.yaml"
    )
    .option(
      "--node-version <version>",
      'set Node.js version for engines.node field (default: "latest")'
    )
    .option("-y, --yes", "Skip prompts and use default values")
    .action(async (name: string | undefined, options: CliOptions) => {
      console.clear();
      p.intro(color.bgCyan(color.black(` create-krispya v${pkg.version} `)));

      let generateOptions: GenerateOptions;

      if (Object.keys(options).length > 0) {
        const template: Template = options.template ?? "vanilla";
        const baseTemplate = getBaseTemplate(template);
        const defaultName = getDefaultProjectName(template);
        const projectType: ProjectType = options.type ?? "app";

        generateOptions = {
          name: name || defaultName,
          projectType,
          libraryBundler: projectType === "library" ? (options.bundler ?? "unbuild") : undefined,
          template,
          linter: options.linter ?? "oxlint",
          formatter: options.formatter ?? "oxfmt",
          ...(baseTemplate === "r3f" && {
            drei: options.drei ? {} : undefined,
            handle: options.handle ? {} : undefined,
            leva: options.leva ? {} : undefined,
            postprocessing: options.postprocessing ? {} : undefined,
            rapier: options.rapier ? {} : undefined,
            xr: options.xr ? {} : undefined,
            uikit: options.uikit ? {} : undefined,
            offscreen: options.offscreen ? {} : undefined,
            zustand: options.zustand ? {} : undefined,
            koota: options.koota ? {} : undefined,
            viverse: options.viverse ? {} : undefined,
            triplex: options.triplex ? {} : undefined,
          }),
          packageManager: options.packageManager,
          pnpmManageVersions: options.pnpmManageVersions,
          nodeVersion: options.nodeVersion ?? "latest",
        };
      } else {
        generateOptions = await promptForOptions(name);
      }

      const base = generateOptions.template
        ? getBaseTemplate(generateOptions.template)
        : "vanilla";
      const defaultFallbackName =
        base === "vanilla"
          ? "vanilla-app"
          : base === "react"
          ? "react-app"
          : "react-three-app";
      generateOptions.name ??= defaultFallbackName;

      // Fetch latest pnpm version if pnpm is selected
      const packageManager = generateOptions.packageManager || "pnpm";
      if (packageManager === "pnpm") {
        generateOptions.pnpmVersion = await getLatestPnpmVersion();
      }

      // Fetch latest Node version if "latest" is specified or default
      const nodeVersion = generateOptions.nodeVersion ?? "latest";
      if (nodeVersion === "latest") {
        generateOptions.nodeVersion = await getLatestNodeVersion();
      }

      // Fetch latest package versions in parallel
      const versions: PackageVersions = {};
      const versionPromises: Promise<void>[] = [
        getLatestNpmVersion("vitest", "4.0.0").then((v) => {
          versions.vitest = v;
        }),
      ];

      // Only fetch vite version for apps
      if (generateOptions.projectType !== "library") {
        versionPromises.push(
          getLatestNpmVersion("vite", "6.3.4").then((v) => {
            versions.vite = v;
          })
        );
      }

      // Fetch linter version
      const linter = generateOptions.linter ?? "oxlint";
      if (linter === "eslint") {
        versionPromises.push(
          getLatestNpmVersion("eslint", "9.17.0").then((v) => {
            versions.eslint = v;
          })
        );
      } else if (linter === "oxlint") {
        versionPromises.push(
          getLatestNpmVersion("oxlint", "0.16.0").then((v) => {
            versions.oxlint = v;
          })
        );
      } else if (linter === "biome") {
        versionPromises.push(
          getLatestNpmVersion("@biomejs/biome", "1.9.4").then((v) => {
            versions.biome = v;
          })
        );
      }

      // Fetch formatter version
      const formatter = generateOptions.formatter ?? "oxfmt";
      if (formatter === "prettier") {
        versionPromises.push(
          getLatestNpmVersion("prettier", "3.4.2").then((v) => {
            versions.prettier = v;
          })
        );
      } else if (formatter === "oxfmt") {
        versionPromises.push(
          getLatestNpmVersion("oxfmt", "0.1.0").then((v) => {
            versions.oxfmt = v;
          })
        );
      } else if (formatter === "biome" && linter !== "biome") {
        // Only fetch if not already fetched for linter
        versionPromises.push(
          getLatestNpmVersion("@biomejs/biome", "1.9.4").then((v) => {
            versions.biome = v;
          })
        );
      }

      await Promise.all(versionPromises);
      generateOptions.versions = versions;

      const basePath = join(cwd(), generateOptions.name);
      const s = p.spinner();
      s.start("Creating project...");

      try {
        const files = generate(generateOptions);
        const filePaths = Object.keys(files).sort();

        for (const filePath of filePaths) {
          const fullFilePath = join(basePath, filePath);
          await mkdir(dirname(fullFilePath), { recursive: true });
          const file = files[filePath]!;

          if (file.type === "text") {
            await writeFile(fullFilePath, file.content);
          } else {
            const response = await fetch(file.url);
            await writeFile(fullFilePath, response.body!);
          }
        }

        s.stop("Project created!");

        const isLibrary = generateOptions.projectType === "library";
        const nextSteps = isLibrary
          ? [
              `cd ${generateOptions.name}`,
              `${packageManager} install`,
              `${packageManager} run build`,
            ].join("\n")
          : [
              `cd ${generateOptions.name}`,
              `${packageManager} install`,
              `${packageManager} run dev`,
            ].join("\n");

        p.note(nextSteps, "Next steps");

        const openEditor = await p.select({
          message: "Open project in editor?",
          options: [
            { value: "skip", label: "Skip" },
            { value: "cursor", label: "Cursor" },
            { value: "code", label: "VS Code" },
            { value: "webstorm", label: "WebStorm" },
          ],
          initialValue: "skip",
        });

        if (!p.isCancel(openEditor) && openEditor !== "skip") {
          const editorNames = {
            cursor: "Cursor",
            code: "VS Code",
            webstorm: "WebStorm",
          };
          try {
            await openInEditor(
              openEditor as "cursor" | "code" | "webstorm",
              basePath
            );
            p.log.success(
              `Opening in ${editorNames[openEditor as keyof typeof editorNames]}...`
            );
          } catch {
            p.log.warn(
              `Could not open ${editorNames[openEditor as keyof typeof editorNames]}. Make sure the CLI command is in your PATH.`
            );
          }
        }

        p.outro(color.green("Happy coding! ✨"));
      } catch (error) {
        s.stop("Failed to create project");
        p.log.error(String(error));
        process.exit(1);
      }
    });

  await program.parseAsync();
}

main().catch(console.error);
