import type { BaseTemplate, File } from "../types.js";

export type TypeScriptConfigResult = {
  files: Record<string, File>;
  devDependencies: Record<string, string>;
};

export type TypeScriptConfigParams = {
  baseTemplate: BaseTemplate;
  workspaceRoot?: string;
};

/**
 * Generates TypeScript configuration files for the project.
 * Creates a solution-style tsconfig with separate app and node configs.
 * If workspaceRoot is provided, configs will extend from the workspace root.
 */
export function generateTypescriptConfig(
  baseTemplateOrParams: BaseTemplate | TypeScriptConfigParams
): TypeScriptConfigResult {
  // Support both old signature (baseTemplate) and new signature (params object)
  const params: TypeScriptConfigParams =
    typeof baseTemplateOrParams === "string"
      ? { baseTemplate: baseTemplateOrParams }
      : baseTemplateOrParams;

  const { baseTemplate, workspaceRoot } = params;
  const isReact = baseTemplate === "react";
  const isR3f = baseTemplate === "r3f";
  const files: Record<string, File> = {};
  const devDependencies: Record<string, string> = {};

  // Solution file - references app and node configs in .config/
  const tsConfig = {
    $schema: "https://json.schemastore.org/tsconfig",
    files: [],
    references: [
      { path: "./.config/tsconfig.app.json" },
      { path: "./.config/tsconfig.node.json" },
    ],
  };

  files["tsconfig.json"] = {
    type: "text",
    content: JSON.stringify(tsConfig, null, 2),
  };

  // App config - browser environment for src/tests
  const tsConfigApp: Record<string, unknown> = workspaceRoot
    ? {
        $schema: "https://json.schemastore.org/tsconfig",
        extends: `${workspaceRoot}/.config/tsconfig.app.json`,
        compilerOptions: {},
        include: ["../src", "../tests"],
      }
    : {
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
        },
        include: ["../src", "../tests"],
      };

  // Add JSX config for React templates (only if not extending from workspace)
  if (isReact || isR3f) {
    if (!workspaceRoot) {
      (tsConfigApp.compilerOptions as Record<string, unknown>).jsx = "react-jsx";
    } else {
      // When extending, override jsx setting
      (tsConfigApp.compilerOptions as Record<string, unknown>).jsx = "react-jsx";
    }
    devDependencies["@types/react"] = "^19.0.0";
    devDependencies["@types/react-dom"] = "^19.0.0";
  }

  // Add Three.js types for r3f
  if (isR3f) {
    devDependencies["@types/three"] = "~0.175.0";
  }

  files[".config/tsconfig.app.json"] = {
    type: "text",
    content: JSON.stringify(tsConfigApp, null, 2),
  };

  // Node config - Node environment for config files
  const tsConfigNode = workspaceRoot
    ? {
        $schema: "https://json.schemastore.org/tsconfig",
        extends: `${workspaceRoot}/.config/tsconfig.node.json`,
        compilerOptions: {},
        include: ["../*.config.ts", "./*.ts"],
      }
    : {
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

  return { files, devDependencies };
}

