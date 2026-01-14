import color from "chalk";
import type { GenerateOptions } from "../types.js";
import { getBaseTemplate, getLanguageFromTemplate } from "../types.js";

export type MonorepoConfigOptions = {
  name: string;
  nodeVersion: string;
  packageManager: string;
  pnpmManageVersions?: boolean;
  linter: string;
  formatter: string;
};

/**
 * Inherited workspace settings that cannot be customized per-package.
 */
export type InheritedFields = {
  linter?: string;
  formatter?: string;
  packageManager?: string;
  nodeVersion?: string;
  pnpmManageVersions?: boolean;
};

/**
 * Formats the configuration summary for display in the CLI.
 * When inherited is provided, those fields are displayed with dim styling.
 */
export function formatConfigSummary(
  options: GenerateOptions,
  inherited?: InheritedFields,
): string {
  const lines: string[] = [];
  const VALUE_COL = 27; // Start position for values

  const formatRow = (label: string, value: string, isInherited = false, indent = "") => {
    const fullLabel = indent + label;
    const dotCount = Math.max(1, VALUE_COL - fullLabel.length - 1);
    const dots = color.gray(".".repeat(dotCount));
    const displayValue = isInherited ? `${value} 🔒` : value;
    return `${indent}${label} ${dots} ${displayValue}`;
  };

  const formatLanguage = (lang: string) => {
    return lang === "typescript" ? "TypeScript" : lang === "javascript" ? "JavaScript" : lang;
  };

  // Template info (React, R3F, etc.)
  const projectType = options.projectType ?? "app";
  const baseTemplate = options.template ? getBaseTemplate(options.template) : "vanilla";
  if (baseTemplate === "react") {
    lines.push(formatRow("Framework", "React"));
  } else if (baseTemplate === "r3f") {
    lines.push(formatRow("Framework", "React Three Fiber"));
  }

  // Language (derived from template)
  const language = options.template ? getLanguageFromTemplate(options.template) : "typescript";
  lines.push(formatRow("Language", formatLanguage(language)));

  // Bundler
  if (projectType === "library") {
    lines.push(formatRow("Bundler", options.libraryBundler ?? "unbuild"));
  } else {
    lines.push(formatRow("Bundler", "vite"));
  }

  // Node version (inherited from workspace)
  const nodeVersionInherited = inherited?.nodeVersion !== undefined;
  lines.push(formatRow("Node version", options.nodeVersion || "latest", nodeVersionInherited));

  // Package manager (inherited from workspace)
  const pmInherited = inherited?.packageManager !== undefined;
  lines.push(formatRow("Package manager", options.packageManager || "pnpm", pmInherited));

  // pnpm-specific options (inherited from workspace)
  if (options.packageManager === "pnpm") {
    const versionManaged = options.pnpmManageVersions ? "yes" : "no";
    const pnpmVersionInherited = inherited?.pnpmManageVersions !== undefined;
    lines.push(formatRow("↳ Version managed", versionManaged, pnpmVersionInherited, ""));
  }

  // Linter (inherited from workspace)
  if (options.linter) {
    const linterInherited = inherited?.linter !== undefined;
    lines.push(formatRow("Linter", options.linter, linterInherited));
  }

  // Formatter (inherited from workspace)
  if (options.formatter) {
    const formatterInherited = inherited?.formatter !== undefined;
    lines.push(formatRow("Formatter", options.formatter, formatterInherited));
  }

  // Testing
  const testing = options.testing ?? (projectType === "library" ? "vitest" : "none");
  lines.push(formatRow("Testing", testing));

  // Config strategy
  const configStrategy = options.configStrategy ?? "stealth";
  lines.push(formatRow("Config strategy", configStrategy));

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
      const right = integrationNames[i + 1] ? `${color.green("●")} ${integrationNames[i + 1]}` : "";
      const spacing = " ".repeat(Math.max(1, 16 - integrationNames[i]!.length));
      lines.push(`  ${left}${spacing}${right}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats the monorepo configuration summary for display in the CLI.
 */
export function formatMonorepoConfigSummary(options: MonorepoConfigOptions): string {
  const lines: string[] = [];
  const VALUE_COL = 27;

  const formatRow = (label: string, value: string, indent = "") => {
    const fullLabel = indent + label;
    const dotCount = Math.max(1, VALUE_COL - fullLabel.length - 1);
    const dots = color.gray(".".repeat(dotCount));
    return `${indent}${label} ${dots} ${value}`;
  };

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
  lines.push(formatRow("Linter", options.linter));

  // Formatter
  lines.push(formatRow("Formatter", options.formatter));

  return lines.join("\n");
}
