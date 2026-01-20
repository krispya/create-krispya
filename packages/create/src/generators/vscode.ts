import type { CodeInjectionLocation, File } from "../types.js";

export type VscodeParams = {
  codeSnippets: Partial<Record<CodeInjectionLocation, string[]>>;
  vscodeSettings: Record<string, unknown>;
};

/**
 * Generates VS Code configuration files.
 */
export function generateVscodeFiles(params: VscodeParams): Record<string, File> {
  const { codeSnippets, vscodeSettings } = params;
  const files: Record<string, File> = {};

  if (codeSnippets["vscode-extension-suggestion"]?.length) {
    // Deduplicate extension recommendations
    const uniqueRecommendations = [...new Set(codeSnippets["vscode-extension-suggestion"])];
    files[".vscode/extensions.json"] = {
      type: "text",
      content: JSON.stringify(
        {
          recommendations: uniqueRecommendations,
        },
        null,
        2,
      ),
    };
  }

  if (Object.keys(vscodeSettings).length > 0) {
    // Sort keys to group related settings (e.g., all oxc.* together)
    const sortedSettings = Object.fromEntries(
      Object.entries(vscodeSettings).sort(([a], [b]) => a.localeCompare(b)),
    );
    files[".vscode/settings.json"] = {
      type: "text",
      content: JSON.stringify(sortedSettings, null, 2),
    };
  }

  return files;
}


