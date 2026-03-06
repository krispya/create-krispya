import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectCurrentConfig, generateExpectedFiles } from "../src/update.js";

describe("update helpers", () => {
  it("uses standalone root config for standalone updates", () => {
    const expected = generateExpectedFiles({
      name: "my-app",
      linter: "oxlint",
      formatter: "prettier",
      packageManager: "pnpm",
      isMonorepo: false,
      configStrategy: "stealth",
    });

    expect(expected["root-config"][".gitignore"]).toEqual({
      type: "text",
      content: [
        "node_modules",
        "dist",
        "*.tsbuildinfo",
        ".env",
        ".env.*",
        "!.env.example",
      ].join("\n"),
    });
    expect(expected["config-packages"]).toEqual({});
    expect(expected["workspace-config"]).toEqual({});
  });

  it("uses workspace root config for monorepo updates", () => {
    const expected = generateExpectedFiles({
      name: "workspace",
      linter: "oxlint",
      formatter: "prettier",
      packageManager: "pnpm",
      isMonorepo: true,
    });

    expect(expected["root-config"][".gitignore"]).toEqual({
      type: "text",
      content: [
        "node_modules",
        "dist",
        "*.tsbuildinfo",
        ".env",
        ".env.*",
        "!.env.example",
        ".DS_Store",
      ].join("\n"),
    });
    expect(expected["config-packages"][".config/typescript/package.json"]).toBeDefined();
  });
});

describe("detectCurrentConfig", () => {
  let tempDir = "";

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("detects standalone package manager and config strategy", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "create-krispya-update-"));
    await mkdir(join(tempDir, ".config"), { recursive: true });
    await writeFile(
      join(tempDir, "package.json"),
      JSON.stringify({
        name: "my-app",
        packageManager: "npm@11.0.0",
      })
    );
    await writeFile(join(tempDir, ".config/tsconfig.app.json"), "{}");

    const config = await detectCurrentConfig(tempDir, false);

    expect(config).toMatchObject({
      name: "my-app",
      packageManager: "npm",
      isMonorepo: false,
      configStrategy: "stealth",
    });
  });
});
