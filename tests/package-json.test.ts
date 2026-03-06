import { describe, expect, it } from "vitest";
import { generatePackageJson } from "../src/generators/package-json.js";
''

function readPackageJsonContent(
  file: { type: "text"; content: string } | { type: "remote"; url: string }
) {
  if (file.type !== "text") {
    throw new Error("Expected package.json to be a text file");
  }

  return JSON.parse(file.content);
}

describe("generatePackageJson", () => {
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
});
