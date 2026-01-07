import type { BaseTemplate, File } from "../types.js";

export type TestFilesParams = {
  baseTemplate: BaseTemplate;
  language: "javascript" | "typescript";
  isLibrary: boolean;
};

/**
 * Generates test files for the project based on template type.
 */
export function generateTestFiles(params: TestFilesParams): Record<string, File> {
  const { baseTemplate, language, isLibrary } = params;

  const files: Record<string, File> = {};
  const ext = language === "typescript" ? "ts" : "js";
  const jsxExt = language === "typescript" ? "tsx" : "jsx";
  const isVanilla = baseTemplate === "vanilla";
  const isReact = baseTemplate === "react";
  const isR3f = baseTemplate === "r3f";

  if (isLibrary) {
    // Library test
    const testExt = isReact || isR3f ? jsxExt : ext;
    let testContent: string;

    if (isVanilla) {
      testContent = [
        `import { describe, it, expect } from "vitest"`,
        `import { hello } from "../src/index.js"`,
        ``,
        `describe("hello", () => {`,
        `  it("returns greeting with default name", () => {`,
        `    expect(hello()).toBe("Hello, world!")`,
        `  })`,
        ``,
        `  it("returns greeting with custom name", () => {`,
        `    expect(hello("vitest")).toBe("Hello, vitest!")`,
        `  })`,
        `})`,
      ].join("\n");
    } else if (isReact) {
      testContent = [
        `import { describe, it, expect } from "vitest"`,
        `import { render, screen } from "@testing-library/react"`,
        `import { MyComponent } from "../src/index.js"`,
        ``,
        `describe("MyComponent", () => {`,
        `  it("renders with default message", () => {`,
        `    render(<MyComponent />)`,
        `    expect(screen.getByText("Hello from library!")).toBeDefined()`,
        `  })`,
        ``,
        `  it("renders with custom message", () => {`,
        `    render(<MyComponent message="Custom message" />)`,
        `    expect(screen.getByText("Custom message")).toBeDefined()`,
        `  })`,
        `})`,
      ].join("\n");
    } else {
      // R3F library - basic test without rendering Canvas
      testContent = [
        `import { describe, it, expect } from "vitest"`,
        `import { MyMesh } from "../src/index.js"`,
        ``,
        `describe("MyMesh", () => {`,
        `  it("is defined", () => {`,
        `    expect(MyMesh).toBeDefined()`,
        `  })`,
        `})`,
      ].join("\n");
    }

    files[`tests/index.test.${testExt}`] = {
      type: "text",
      content: testContent,
    };
  } else if (isVanilla) {
    // Vanilla app test
    const testContent = [
      `import { describe, it, expect } from "vitest"`,
      ``,
      `describe("example", () => {`,
      `  it("works", () => {`,
      `    expect(1 + 1).toBe(2)`,
      `  })`,
      `})`,
    ].join("\n");

    files[`tests/main.test.${ext}`] = { type: "text", content: testContent };
  } else if (isReact) {
    // React app test
    const testContent = [
      `import { describe, it, expect } from "vitest"`,
      `import { render, screen } from "@testing-library/react"`,
      `import { App } from "../src/app.js"`,
      ``,
      `describe("App", () => {`,
      `  it("renders heading", () => {`,
      `    render(<App />)`,
      `    expect(screen.getByText("Hello React!")).toBeDefined()`,
      `  })`,
      `})`,
    ].join("\n");

    files[`tests/app.test.${jsxExt}`] = { type: "text", content: testContent };
  } else {
    // R3F app test - basic test without rendering Canvas
    const testContent = [
      `import { describe, it, expect } from "vitest"`,
      `import { App } from "../src/app.js"`,
      ``,
      `describe("App", () => {`,
      `  it("is defined", () => {`,
      `    expect(App).toBeDefined()`,
      `  })`,
      `})`,
    ].join("\n");

    files[`tests/app.test.${jsxExt}`] = { type: "text", content: testContent };
  }

  return files;
}


