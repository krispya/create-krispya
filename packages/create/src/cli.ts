#!/usr/bin/env node
import { createRequire } from "module";
import { cwd } from "process";
import { dirname, join, resolve } from "path";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import { constants } from "fs";
import { Command } from "commander";
import * as p from "@clack/prompts";
import color from "chalk";
import { fetch } from "undici";

import {
  editorNames,
  getDefaultProjectName,
  openInEditor,
  promptForOptions,
  promptForPackageOptions,
  promptForInitialPackage,
} from "./cli/index.js";
import {
  clearConfig,
  EditorChoice,
  getConfigPath,
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
  configPath?: boolean;
  openConfig?: boolean;
}

/**
 * Detects if the current directory is inside a monorepo workspace.
 * Looks for pnpm-workspace.yaml with packages array in current or parent directories.
 */
async function detectMonorepoRoot(): Promise<string | null> {
  let currentDir = cwd();
  const root = resolve("/");

  while (currentDir !== root) {
    const workspaceFile = join(currentDir, "pnpm-workspace.yaml");
    try {
      await access(workspaceFile, constants.F_OK);
      const content = await readFile(workspaceFile, "utf-8");
      // Check if it has packages field (indicating it's a monorepo workspace)
      if (content.includes("packages:")) {
        return currentDir;
      }
    } catch {
      // File doesn't exist, continue
    }
    currentDir = dirname(currentDir);
  }

  return null;
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
    .option("--config-path", "Print the path to the config file")
    .option("--open-config", "Open the config folder in file explorer")
    .action(async (name: string | undefined, options: CliOptions) => {
      // Short-circuit: config management flags exit immediately
      if (options.clearConfig) {
        clearConfig();
        console.log("Configuration cleared.");
        process.exit(0);
      }

      if (options.configPath) {
        console.log(getConfigPath());
        process.exit(0);
      }

      if (options.openConfig) {
        const configDir = dirname(getConfigPath());
        const { exec } = await import("child_process");
        const cmd =
          process.platform === "win32"
            ? `start "" "${configDir}"`
            : process.platform === "darwin"
              ? `open "${configDir}"`
              : `xdg-open "${configDir}"`;
        exec(cmd);
        process.exit(0);
      }

      console.clear();
      p.intro(color.bgCyan(color.black(` create-krispya v${pkg.version} `)));

      // Check if we're inside a monorepo workspace
      const monorepoRoot = await detectMonorepoRoot();
      if (monorepoRoot && Object.keys(options).length === 0) {
        // Detected monorepo - prompt to add package or create standalone
        const choice = await p.select({
          message: "Detected monorepo workspace",
          options: [
            { value: "add", label: "Add new package to this workspace" },
            { value: "standalone", label: "Create standalone project" },
          ],
          initialValue: "add",
        });

        if (p.isCancel(choice)) {
          p.cancel("Operation cancelled.");
          process.exit(0);
        }

        if (choice === "add") {
          // Add package to workspace flow
          const packageType = await promptForInitialPackage();
          
          if (packageType === "skip") {
            p.cancel("Operation cancelled.");
            process.exit(0);
          }

          // Prompt for package name
          const packageName = await p.text({
            message: "Package name?",
            placeholder: packageType === "app" ? "my-app" : "my-package",
            validate: (value) => {
              if (!value.length) return "Package name is required";
            },
          });

          if (p.isCancel(packageName)) {
            p.cancel("Operation cancelled.");
            process.exit(0);
          }

          // Determine target directory
          const targetDir = packageType === "app" ? "apps" : "packages";
          const packagePath = join(targetDir, packageName as string);
          
          // Calculate workspace root relative path from package location
          const workspaceRoot = "../..";

          // Continue with package prompt flow (project type already known)
          const packageOptions = await promptForPackageOptions(packageName as string, packageType);
          packageOptions.workspaceRoot = workspaceRoot;
          // Keep package name as just the name (not the full path)
          packageOptions.name = packageName as string;

          // Fetch versions and continue with generation
          const packageManager = packageOptions.packageManager || "pnpm";
          if (packageManager === "pnpm") {
            packageOptions.pnpmVersion = await getLatestPnpmVersion();
          }

          const nodeVersion = packageOptions.nodeVersion ?? "latest";
          if (nodeVersion === "latest") {
            packageOptions.nodeVersion = await getLatestNodeVersion();
          }

          // Fetch package versions
          const versions: PackageVersions = {};
          const versionPromises: Promise<void>[] = [];

          // Only fetch vitest version if testing is enabled
          const pkgIsLibrary = packageOptions.projectType === "library";
          const pkgTesting = packageOptions.testing ?? (pkgIsLibrary ? "vitest" : "none");
          if (pkgTesting === "vitest") {
            versionPromises.push(
              getLatestNpmVersion("vitest", "4.0.0").then((v) => {
                versions.vitest = v;
              })
            );
          }

          if (!pkgIsLibrary) {
            versionPromises.push(
              getLatestNpmVersion("vite", "6.3.4").then((v) => {
                versions.vite = v;
              })
            );
          }

          const linter = packageOptions.linter ?? "oxlint";
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

          const formatter = packageOptions.formatter ?? "oxfmt";
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
            versionPromises.push(
              getLatestNpmVersion("@biomejs/biome", "1.9.4").then((v) => {
                versions.biome = v;
              })
            );
          }

          await Promise.all(versionPromises);
          packageOptions.versions = versions;

          const basePath = join(monorepoRoot, packagePath);
          const s = p.spinner();
          s.start("Creating package...");

          try {
            const files = generate(packageOptions);
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

            s.stop("Package created!");

            const isLibrary = packageOptions.projectType === "library";
            const nextSteps = isLibrary
              ? [
                  `cd ${packagePath}`,
                  `${packageManager} install`,
                  `${packageManager} run build`,
                ].join("\n")
              : [
                  `cd ${packagePath}`,
                  `${packageManager} install`,
                  `${packageManager} run dev`,
                ].join("\n");

            p.note(nextSteps, "Next steps");
            p.outro(color.green("Happy coding! ✨"));
            process.exit(0);
          } catch (error) {
            s.stop("Failed to create package");
            p.log.error(String(error));
            process.exit(1);
          }
        }
        // If standalone, continue with normal flow below
      }

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

      // Handle monorepo generation differently
      if (generateOptions.projectType === "monorepo") {
        // Import generateMonorepo dynamically
        const { generateMonorepo } = await import("./generators/monorepo.js");

        // Fetch pnpm version if needed
        const packageManager = generateOptions.packageManager || "pnpm";
        if (packageManager === "pnpm") {
          generateOptions.pnpmVersion = await getLatestPnpmVersion();
        }

        // Fetch Node version
        const nodeVersion = generateOptions.nodeVersion ?? "latest";
        if (nodeVersion === "latest") {
          generateOptions.nodeVersion = await getLatestNodeVersion();
        }

        const basePath = join(cwd(), generateOptions.name);
        const s = p.spinner();
        s.start("Creating monorepo workspace...");

        try {
          const { files } = generateMonorepo({
            name: generateOptions.name,
            linter: generateOptions.linter ?? "oxlint",
            formatter: generateOptions.formatter ?? "oxfmt",
            packageManager,
            pnpmVersion: generateOptions.pnpmVersion,
            pnpmManageVersions: generateOptions.pnpmManageVersions,
            nodeVersion: generateOptions.nodeVersion,
          });

          // Write all files
          const filePaths = Object.keys(files).sort();
          for (const filePath of filePaths) {
            const fullFilePath = join(basePath, filePath);
            await mkdir(dirname(fullFilePath), { recursive: true });
            const file = files[filePath]!;

            if (file.type === "text") {
              await writeFile(fullFilePath, file.content);
            }
          }

          s.stop("Monorepo workspace created!");

          // Ask if user wants to add an initial package
          const initialPackage = await promptForInitialPackage();

          if (initialPackage !== "skip") {
            // Prompt for package name
            const packageName = await p.text({
              message: "Package name?",
              placeholder: initialPackage === "app" ? "my-app" : "my-package",
              validate: (value) => {
                if (!value.length) return "Package name is required";
              },
            });

            if (!p.isCancel(packageName)) {
              const targetDir = initialPackage === "app" ? "apps" : "packages";
              const packagePath = join(targetDir, packageName as string);
              
              // Prompt for template and other options for the initial package
              const packageOptions = await promptForPackageOptions(packageName as string, initialPackage);
              packageOptions.workspaceRoot = "../..";
              // Keep package name as just the name (not the full path)
              packageOptions.name = packageName as string;

              // Fetch versions for the package
              const pkgManager = packageOptions.packageManager || "pnpm";
              const versions: PackageVersions = {};
              const versionPromises: Promise<void>[] = [];

              // Only fetch vitest version if testing is enabled
              const initPkgIsLibrary = packageOptions.projectType === "library";
              const initPkgTesting = packageOptions.testing ?? (initPkgIsLibrary ? "vitest" : "none");
              if (initPkgTesting === "vitest") {
                versionPromises.push(
                  getLatestNpmVersion("vitest", "4.0.0").then((v) => {
                    versions.vitest = v;
                  })
                );
              }

              if (!initPkgIsLibrary) {
                versionPromises.push(
                  getLatestNpmVersion("vite", "6.3.4").then((v) => {
                    versions.vite = v;
                  })
                );
              }

              await Promise.all(versionPromises);
              packageOptions.versions = versions;

              s.start("Creating initial package...");

              const packageFiles = generate(packageOptions);
              const packageFilePaths = Object.keys(packageFiles).sort();

              // Write package files to the correct subdirectory
              const packageBasePath = join(basePath, packagePath);
              for (const filePath of packageFilePaths) {
                const fullFilePath = join(packageBasePath, filePath);
                await mkdir(dirname(fullFilePath), { recursive: true });
                const file = packageFiles[filePath]!;

                if (file.type === "text") {
                  await writeFile(fullFilePath, file.content);
                } else {
                  const response = await fetch(file.url);
                  await writeFile(fullFilePath, response.body!);
                }
              }

              s.stop("Initial package created!");
            }
          }

          const nextSteps = [
            `cd ${generateOptions.name}`,
            `${packageManager} install`,
            `${packageManager} run dev`,
          ].join("\n");

          p.note(nextSteps, "Next steps");
          p.outro(color.green("Happy coding! ✨"));
          process.exit(0);
        } catch (error) {
          s.stop("Failed to create monorepo workspace");
          p.log.error(String(error));
          process.exit(1);
        }
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
      const versionPromises: Promise<void>[] = [];

      // Only fetch vitest version if testing is enabled
      const isLibrary = generateOptions.projectType === "library";
      const testing = generateOptions.testing ?? (isLibrary ? "vitest" : "none");
      if (testing === "vitest") {
        versionPromises.push(
          getLatestNpmVersion("vitest", "4.0.0").then((v) => {
            versions.vitest = v;
          })
        );
      }

      // Only fetch vite version for apps
      if (!isLibrary) {
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
