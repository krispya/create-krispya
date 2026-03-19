import { afterEach, describe, expect, it, vi } from "vitest";
import { generatePackageJson } from "../src/generators/package-json.js";
import {
  resolveEngine,
  resolveProjectPackageVersions,
} from "../src/package-versions.js";

function readPackageJsonContent(
  file: { type: "text"; content: string } | { type: "remote"; url: string },
) {
  if (file.type !== "text") {
    throw new Error("Expected package.json to be a text file");
  }

  return JSON.parse(file.content);
}

describe("generatePackageJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults standalone libraries to version 0.1.0", () => {
    const result = generatePackageJson({
      name: "my-lib",
      baseTemplate: "vanilla",
      language: "typescript",
      isLibrary: true,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: "my-lib",
      },
    });

    const packageJson = readPackageJsonContent(result.files["package.json"]);
    expect(packageJson.version).toBe("0.1.0");
  });

  it("defaults workspace libraries to version 0.1.0", () => {
    const result = generatePackageJson({
      name: "@scope/my-lib",
      baseTemplate: "vanilla",
      language: "typescript",
      isLibrary: true,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: "@scope/my-lib",
        workspaceRoot: "../..",
      },
    });

    const packageJson = readPackageJsonContent(result.files["package.json"]);
    expect(packageJson.version).toBe("0.1.0");
  });

  it("uses the selected node version for both types and engines", () => {
    const result = generatePackageJson({
      name: "my-app",
      baseTemplate: "vanilla",
      language: "javascript",
      isLibrary: false,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: "my-app",
        engine: { name: "node", version: "25.1.0" },
      },
    });

    const packageJson = readPackageJsonContent(result.files["package.json"]);
    expect(packageJson.devDependencies["@types/node"]).toBe("^25.0.0");
    expect(packageJson.engines.node).toBe(">=25.0.0");
  });

  it("uses the resolved @types/node version when available", () => {
    const result = generatePackageJson({
      name: "my-app",
      baseTemplate: "vanilla",
      language: "javascript",
      isLibrary: false,
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
      scripts: {},
      options: {
        name: "my-app",
        engine: { name: "node", version: "25.1.0" },
        versions: { "@types/node": "25.3.5" },
      },
    });

    const packageJson = readPackageJsonContent(result.files["package.json"]);
    expect(packageJson.devDependencies["@types/node"]).toBe("^25.3.5");
    expect(packageJson.engines.node).toBe(">=25.0.0");
  });
});
