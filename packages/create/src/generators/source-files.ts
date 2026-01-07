import {
  HtmlContent,
  IndexContent,
  ViteHtmlContent,
  ViteIndexContent,
  ViteStyleContent,
} from "../constants.js";
import type { BaseTemplate, CodeInjectionLocation, File } from "../types.js";

export type SourceFilesParams = {
  name: string;
  baseTemplate: BaseTemplate;
  language: "javascript" | "typescript";
  isLibrary: boolean;
  codeSnippets: Partial<Record<CodeInjectionLocation, string[]>>;
  replacements: Array<{ search: string; replace: string }>;
};

/**
 * Generates source files for the project based on template type.
 */
export function generateSourceFiles(params: SourceFilesParams): Record<string, File> {
  const { name, baseTemplate, language, isLibrary, codeSnippets, replacements } = params;

  const files: Record<string, File> = {};
  const ext = language === "typescript" ? "ts" : "js";
  const jsxExt = language === "typescript" ? "tsx" : "jsx";
  const isVanilla = baseTemplate === "vanilla";
  const isReact = baseTemplate === "react";
  const isR3f = baseTemplate === "r3f";

  if (isLibrary) {
    // Library entry point
    const libExt = isReact || isR3f ? jsxExt : ext;
    let libContent: string;

    if (isVanilla) {
      libContent = [
        `// Library entry point`,
        `export function hello(name: string = "world"): string {`,
        `  return \`Hello, \${name}!\``,
        `}`,
      ].join("\n");
    } else if (isReact) {
      libContent = [
        `// Library entry point`,
        `export function MyComponent({ message = "Hello from library!" }: { message?: string }) {`,
        `  return <div>{message}</div>`,
        `}`,
      ].join("\n");
    } else {
      // R3F library
      libContent = [
        `// Library entry point`,
        `export function MyMesh({ color = "orange" }: { color?: string }) {`,
        `  return (`,
        `    <mesh>`,
        `      <boxGeometry />`,
        `      <meshStandardMaterial color={color} />`,
        `    </mesh>`,
        `  )`,
        `}`,
      ].join("\n");
    }

    files[`src/index.${libExt}`] = { type: "text", content: libContent };
  } else if (isVanilla) {
    // Vanilla template
    files[`src/main.${ext}`] = { type: "text", content: ViteIndexContent };
    files["src/style.css"] = { type: "text", content: ViteStyleContent };
    const indexHtml = ViteHtmlContent.replace("$indexPath", `./src/main.${ext}`).replace(
      "$title",
      name,
    );
    files["index.html"] = { type: "text", content: indexHtml };
  } else {
    // React and R3F templates
    files[`src/index.tsx`] = { type: "text", content: IndexContent };

    const indexHtml = HtmlContent.replace(
      "$indexPath",
      language === "javascript" ? "./src/index.jsx" : "./src/index.tsx",
    ).replace("$title", name);
    files["index.html"] = { type: "text", content: indexHtml };

    // Generate app.tsx
    codeSnippets["dom-end"]?.reverse();
    codeSnippets["global-end"]?.reverse();
    codeSnippets["scene-end"]?.reverse();

    let appCode: string;
    if (isReact) {
      // Simple React app without Canvas
      appCode = [
        ...(codeSnippets["import"] ?? []),
        ...(codeSnippets["global-start"] ?? []),
        `export function App() {`,
        "  return (",
        '    <div style={{ padding: "2rem" }}>',
        "      <h1>Hello React!</h1>",
        "      <p>Edit src/app.tsx and save to see changes.</p>",
        "    </div>",
        "  )",
        "}",
        ...(codeSnippets["global-end"] ?? []),
      ].join("\n");
    } else {
      // R3F app with Canvas
      appCode = [
        ...(codeSnippets["import"] ?? []),
        ...(codeSnippets["global-start"] ?? []),
        `export function App() {`,
        " return <>",
        ...(codeSnippets["dom-start"] ?? []),
        ...(codeSnippets["dom"] ?? []),
        "   <Canvas>",
        ...(codeSnippets["scene-start"] ?? []),
        ...(codeSnippets["scene"] ?? []),
        ...(codeSnippets["scene-end"] ?? []),
        "   </Canvas>",
        ...(codeSnippets["dom-end"] ?? []),
        " </>",
        "}",
        ...(codeSnippets["global-end"] ?? []),
      ].join("\n");
    }

    for (const { search, replace } of replacements) {
      appCode = appCode.replace(search, replace);
    }
    files[`src/app.tsx`] = { type: "text", content: appCode };
  }

  return files;
}


