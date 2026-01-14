import type { BaseTemplate, ConfigStrategy, File } from "../types.js";

export type TypeScriptConfigResult = {
  files: Record<string, File>;
  devDependencies: Record<string, string>;
};

export type TypeScriptConfigParams = {
  baseTemplate: BaseTemplate;
  /** When true, extends from @config/typescript package (monorepo context) */
  useConfigPackage?: boolean;
  /** Config strategy for standalone projects */
  configStrategy?: ConfigStrategy;
};

/**
 * Generates TypeScript configuration files for the project.
 * In monorepo context (useConfigPackage=true): simple tsconfig.json extending from @config/typescript.
 * In standalone stealth mode: solution-style tsconfig with separate app and node configs in .config/.
 * In standalone root mode: single tsconfig.json with all settings inline.
 */
export function generateTypescriptConfig(
  baseTemplateOrParams: BaseTemplate | TypeScriptConfigParams,
): TypeScriptConfigResult {
  // Support both old signature (baseTemplate) and new signature (params object)
  const params: TypeScriptConfigParams =
    typeof baseTemplateOrParams === "string"
      ? { baseTemplate: baseTemplateOrParams }
      : baseTemplateOrParams;

  const { baseTemplate, useConfigPackage, configStrategy = "stealth" } = params;
  const isReact = baseTemplate === "react";
  const isR3f = baseTemplate === "r3f";
  const files: Record<string, File> = {};
  const devDependencies: Record<string, string> = {};

  // Add React types for React templates
  if (isReact || isR3f) {
    devDependencies["@types/react"] = "^19.0.0";
    devDependencies["@types/react-dom"] = "^19.0.0";
  }

  // Add Three.js types for r3f
  if (isR3f) {
    devDependencies["@types/three"] = "~0.175.0";
  }

  if (useConfigPackage) {
    // Monorepo context - simple single tsconfig extending from @config package
    devDependencies["@config/typescript"] = "workspace:*";

    const baseConfig =
      isReact || isR3f ? "@config/typescript/react.json" : "@config/typescript/app.json";

    files["tsconfig.json"] = {
      type: "text",
      content: JSON.stringify(
        {
          $schema: "https://json.schemastore.org/tsconfig",
          extends: baseConfig,
          include: ["src/**/*", "tests/**/*"],
        },
        null,
        2,
      ),
    };

    return { files, devDependencies };
  }

  if (configStrategy === "stealth") {
    // Standalone stealth - solution-style tsconfig with .config/ folder
    const tsConfig = {
      $schema: "https://json.schemastore.org/tsconfig",
      files: [],
      references: [{ path: "./.config/tsconfig.app.json" }, { path: "./.config/tsconfig.node.json" }],
    };

    files["tsconfig.json"] = {
      type: "text",
      content: JSON.stringify(tsConfig, null, 2),
    };

    // App config - browser environment for src/tests
    const tsConfigApp = {
      $schema: "https://json.schemastore.org/tsconfig",
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["DOM", "DOM.Iterable", "ESNext"],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
        ...(isReact || isR3f ? { jsx: "react-jsx" } : {}),
      },
      include: ["../src", "../tests"],
    };

    files[".config/tsconfig.app.json"] = {
      type: "text",
      content: JSON.stringify(tsConfigApp, null, 2),
    };

    // Node config - Node environment for config files
    const tsConfigNode = {
      $schema: "https://json.schemastore.org/tsconfig",
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ESNext"],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
      },
      include: ["../*.config.ts", "./*.ts"],
    };

    files[".config/tsconfig.node.json"] = {
      type: "text",
      content: JSON.stringify(tsConfigNode, null, 2),
    };
  } else {
    // Standalone root - solution-style tsconfig with files at root
    const tsConfig = {
      $schema: "https://json.schemastore.org/tsconfig",
      files: [],
      references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }],
    };

    files["tsconfig.json"] = {
      type: "text",
      content: JSON.stringify(tsConfig, null, 2),
    };

    // App config - browser environment for src/tests
    const tsConfigApp = {
      $schema: "https://json.schemastore.org/tsconfig",
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["DOM", "DOM.Iterable", "ESNext"],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
        ...(isReact || isR3f ? { jsx: "react-jsx" } : {}),
      },
      include: ["src", "tests"],
    };

    files["tsconfig.app.json"] = {
      type: "text",
      content: JSON.stringify(tsConfigApp, null, 2),
    };

    // Node config - Node environment for config files
    const tsConfigNode = {
      $schema: "https://json.schemastore.org/tsconfig",
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        lib: ["ESNext"],
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        skipLibCheck: true,
        composite: true,
        rewriteRelativeImportExtensions: true,
        erasableSyntaxOnly: true,
      },
      include: ["*.config.ts"],
    };

    files["tsconfig.node.json"] = {
      type: "text",
      content: JSON.stringify(tsConfigNode, null, 2),
    };
  }

  return { files, devDependencies };
}
