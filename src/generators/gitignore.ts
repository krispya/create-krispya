import type { File } from "../types.js";

export type GitignoreVariant = "standalone" | "workspace-root";

const COMMON_GITIGNORE_LINES = ["node_modules", "dist", "*.tsbuildinfo", ".env", ".env.*", "!.env.example"];

export function generateGitignore(variant: GitignoreVariant): File {
  const lines =
    variant === "workspace-root"
      ? [...COMMON_GITIGNORE_LINES, ".DS_Store"]
      : COMMON_GITIGNORE_LINES;

  return {
    type: "text",
    content: lines.join("\n"),
  };
}
