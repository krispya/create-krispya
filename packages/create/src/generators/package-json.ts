import type { BaseTemplate, File, GenerateOptions } from "../types.js";

export type PackageJsonResult = {
  files: Record<string, File>;
};

export type PackageJsonParams = {
  name: string;
  baseTemplate: BaseTemplate;
  language: "javascript" | "typescript";
  isLibrary: boolean;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  scripts: Record<string, string>;
  options: GenerateOptions;
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
  } = params;

  const files: Record<string, File> = {};
  const packageManager = options.packageManager ?? "pnpm";
  const isPnpm = packageManager === "pnpm";

  const ext = language === "typescript" ? "ts" : "js";
  const jsxExt = language === "typescript" ? "tsx" : "jsx";
  const isReact = baseTemplate === "react";
  const isR3f = baseTemplate === "r3f";

  const packageJson: Record<string, unknown> = {
    name,
    description: "Built with 🌹 create-krispya",
    type: "module",
  };

  // Add library-specific fields (ESM-first)
  if (isLibrary) {
    packageJson.main = "./dist/index.mjs";
    packageJson.module = "./dist/index.mjs";
    if (language === "typescript") {
      packageJson.types = "./dist/index.d.ts";
    }
    packageJson.exports = {
      ".": {
        ...(language === "typescript" && { types: "./dist/index.d.ts" }),
        import: "./dist/index.mjs",
        require: "./dist/index.cjs",
      },
    };
    packageJson.files = ["dist"];
  }

  // Helper to sort object keys alphabetically
  const sortKeys = <T extends Record<string, string>>(obj: T): T =>
    Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) as T;

  packageJson.scripts = scripts;
  packageJson.dependencies = sortKeys(dependencies);

  if (Object.keys(devDependencies).length > 0) {
    packageJson.devDependencies = sortKeys(devDependencies);
  }

  if (isLibrary && Object.keys(peerDependencies).length > 0) {
    packageJson.peerDependencies = sortKeys(peerDependencies);
  }

  // Add packageManager and engines fields (skip for monorepo sub-packages - use root config)
  const isMonorepoPackage = options.workspaceRoot != null;
  if (!isMonorepoPackage) {
    const engines: Record<string, string> = {};

    if (isPnpm) {
      const pnpmVersion = options.pnpmVersion ?? "10.11.0";
      const majorVersion = pnpmVersion.split(".")[0];
      engines.pnpm = `>=${majorVersion}.0.0`;
      packageJson.packageManager = `pnpm@${pnpmVersion}`;
    }

    if (options.nodeVersion) {
      const majorVersion = options.nodeVersion.split(".")[0];
      engines.node = `>=${majorVersion}.0.0`;
    }

    if (Object.keys(engines).length > 0) {
      packageJson.engines = engines;
    }
  }

  files["package.json"] = {
    type: "text",
    content: JSON.stringify(packageJson, null, 2),
  };

  // Add pnpm-workspace.yaml when pnpm is selected (but not in a workspace package)
  if (isPnpm && !options.workspaceRoot) {
    const manageVersions = options.pnpmManageVersions ?? true;
    const workspaceLines: string[] = [];

    if (manageVersions) {
      workspaceLines.push("manage-package-manager-versions: true", "");
    }

    workspaceLines.push("onlyBuiltDependencies:", "  - esbuild");

    files["pnpm-workspace.yaml"] = {
      type: "text",
      content: workspaceLines.join("\n"),
    };
  }

  return { files };
}

