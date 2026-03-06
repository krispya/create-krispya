import { describe, expect, it } from "vitest";
import { generateGitignore } from "../src/generators/gitignore.js";

describe("generateGitignore", () => {
  it("generates the standalone gitignore", () => {
    expect(generateGitignore("standalone")).toEqual({
      type: "text",
      content: ["node_modules", "dist", "*.tsbuildinfo", ".env", ".env.*", "!.env.example"].join("\n"),
    });
  });

  it("generates the workspace root gitignore", () => {
    expect(generateGitignore("workspace-root")).toEqual({
      type: "text",
      content: ["node_modules", "dist", "*.tsbuildinfo", ".env", ".env.*", "!.env.example", ".DS_Store"].join("\n"),
    });
  });
});
