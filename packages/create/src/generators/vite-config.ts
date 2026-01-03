import type { CodeInjectionLocation, File } from "../types.js";

export type ViteConfigParams = {
  viteConfig: Record<string, unknown>;
  codeSnippets: Partial<Record<CodeInjectionLocation, string[]>>;
};

/**
 * Generates the vite.config.ts file.
 */
export function generateViteConfig(params: ViteConfigParams): File {
  const { viteConfig, codeSnippets } = params;

  const viteConfigContent = [
    `import { defineConfig } from 'vite'`,
    ...(codeSnippets["vite-config-import"] ?? []),
    `export default defineConfig(${JSON.stringify(viteConfig).replace(
      /"\$raw:([^"]+)"/g,
      (_, raw) => raw
    )})`,
  ].join("\n");

  return { type: "text", content: viteConfigContent };
}

