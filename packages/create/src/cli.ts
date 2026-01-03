#!/usr/bin/env node
import { createRequire } from "module";
import { cwd } from "process";
import { dirname, join } from "path";
import { mkdir, writeFile } from "fs/promises";
import { Command } from "commander";
import * as p from "@clack/prompts";
import color from "chalk";
import { fetch } from "undici";

import {
  editorNames,
  getDefaultProjectName,
  openInEditor,
  promptForOptions,
} from "./cli/index.js";
import {
  clearConfig,
  EditorChoice,
  getPreferredEditor,
  getReuseWindow,
  setPreferredEditor,
  setReuseWindow,
} from "./config.js";
import {
  generate,
  getBaseTemplate,
  getLatestNodeVersion,
  getLatestNpmVersion,
  getLatestPnpmVersion,
  type GenerateOptions,
  type LibraryBundler,
  type PackageVersions,
  type ProjectType,
  type Template,
} from "./index.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

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
  clearConfig?: boolean;
}

async function main() {
  const program = new Command()
    .name("create-krispya")
    .description("CLI for creating Vanilla, React, and React Three Fiber projects")
    .argument("[name]", "name for the project")
    .option("--type <type>", "project type: app or library (default: app)")
    .option(
      "--bundler <bundler>",
      "library bundler: unbuild or tsdown (default: unbuild, only for libraries)"
    )
    .option(
      "--template <type>",
      "project template: vanilla, vanilla-js, react, react-js, r3f, r3f-js (default: vanilla)"
    )
    .option("--linter <type>", "linter: eslint, oxlint, or biome (default: oxlint)")
    .option("--formatter <type>", "formatter: prettier, oxfmt, or biome (default: oxfmt)")
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
    .option("--package-manager <manager>", "specify package manager (e.g. npm, yarn, pnpm)")
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
    .option("--clear-config", "Clear saved preferences (e.g. editor choice)")
    .action(async (name: string | undefined, options: CliOptions) => {
      // Handle --clear-config flag
      if (options.clearConfig) {
        clearConfig();
        console.log("Configuration cleared.");
        process.exit(0);
      }

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

      const base = generateOptions.template ? getBaseTemplate(generateOptions.template) : "vanilla";
      const defaultFallbackName =
        base === "vanilla" ? "vanilla-app" : base === "react" ? "react-app" : "react-three-app";
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

        const savedEditor = getPreferredEditor();
        let selectedEditor: EditorChoice | undefined;

        if (savedEditor && savedEditor !== "skip") {
          // Saved preference exists - show confirm prompt
          const useDefault = await p.confirm({
            message: `Open in editor? ${color.dim(`(${editorNames[savedEditor]})`)}`,
            initialValue: true,
          });

          if (p.isCancel(useDefault)) {
            selectedEditor = undefined;
          } else if (useDefault) {
            selectedEditor = savedEditor;
          } else {
            selectedEditor = "skip";
          }
        } else {
          // No saved preference - show full selection
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

          if (!p.isCancel(openEditor)) {
            selectedEditor = openEditor as EditorChoice;

            // Ask to save preference
            const saveChoice = await p.confirm({
              message: `Save ${editorNames[selectedEditor] ?? "Skip"} as default editor?`,
              initialValue: true,
            });

            if (!p.isCancel(saveChoice) && saveChoice) {
              setPreferredEditor(selectedEditor);

              // Ask about window preference (only for editors that support it)
              if (selectedEditor === "cursor" || selectedEditor === "code") {
                const reuseChoice = await p.confirm({
                  message: "Reuse current window when opening projects?",
                  initialValue: false,
                });

                if (!p.isCancel(reuseChoice)) {
                  setReuseWindow(reuseChoice);
                }
              }
            }
          }
        }

        if (selectedEditor && selectedEditor !== "skip") {
          try {
            await openInEditor(
              selectedEditor as "cursor" | "code" | "webstorm",
              basePath,
              getReuseWindow()
            );
            p.log.success(`Opening in ${editorNames[selectedEditor]}...`);
          } catch {
            p.log.warn(
              `Could not open ${editorNames[selectedEditor]}. Make sure the CLI command is in your PATH.`
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
