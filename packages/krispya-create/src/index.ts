import {
  GitAttributes,
  HtmlContent,
  IndexContent,
  ViteHtmlContent,
  ViteIndexContent,
  ViteStyleContent,
} from "./constants.js";
import { generateBiome } from "./integrations/biome.js";
import { GenerateDreiOptions, generateDrei } from "./integrations/drei.js";
import { generateEslint } from "./integrations/eslint.js";
import { generateFiber, GenerateFiberOptions } from "./integrations/fiber.js";
import { generateGithubPages, GenerateGithubPagesOptions } from "./integrations/github-pages.js";
import { generateHandle, GenerateHandleOptions } from "./integrations/handle.js";
import { generateKoota, GenerateKootaOptions } from "./integrations/koota.js";
import { generateLeva, GenerateLevaOptions } from "./integrations/leva.js";
import { generateOffscreen, GenerateOffscreenOptions } from "./integrations/offscreen.js";
import { generateOxfmt } from "./integrations/oxfmt.js";
import { generateOxlint } from "./integrations/oxlint.js";
import {
  generatePostprocessing,
  GeneratePostprocessingOptions,
} from "./integrations/postprocessing.js";
import { generatePrettier } from "./integrations/prettier.js";
import { generateRapier, GenerateRapierOptions } from "./integrations/rapier.js";
import { generateUikit, GenerateUikitOptions } from "./integrations/uikit.js";
import { generateXr, GenerateXrOptions } from "./integrations/xr.js";
import { generateZustand, GenerateZustandOptions } from "./integrations/zustand.js";
import { generateTriplex, GenerateTriplexOptions } from "./integrations/triplex.js";
import { merge } from "./merge.js";
import { generateViverse, GenerateViverseOptions } from "./integrations/viverse.js";

export * from "./utils.js";

export type Template = "vanilla" | "vanilla-js" | "react" | "react-js" | "r3f" | "r3f-js";

export type BaseTemplate = "vanilla" | "react" | "r3f";

export function getLanguageFromTemplate(template: Template): "javascript" | "typescript" {
  return template.endsWith("-js") ? "javascript" : "typescript";
}

export function getBaseTemplate(template: Template): BaseTemplate {
  return template.replace("-js", "") as BaseTemplate;
}

export type PackageVersions = {
  vite?: string;
  eslint?: string;
  oxlint?: string;
  oxfmt?: string;
  prettier?: string;
  biome?: string;
};

export type GenerateOptions = {
  githubUserName?: string;
  githubRepoName?: string;
  name: string;
  template?: Template;
  linter?: Linter;
  formatter?: Formatter;
  versions?: PackageVersions;
  fiber?: GenerateFiberOptions;
  handle?: GenerateHandleOptions;
  drei?: GenerateDreiOptions;
  koota?: GenerateKootaOptions;
  leva?: GenerateLevaOptions;
  offscreen?: GenerateOffscreenOptions;
  postprocessing?: GeneratePostprocessingOptions;
  rapier?: GenerateRapierOptions;
  triplex?: GenerateTriplexOptions;
  viverse?: GenerateViverseOptions;
  uikit?: GenerateUikitOptions;
  xr?: GenerateXrOptions;
  zustand?: GenerateZustandOptions;
  githubPages?: GenerateGithubPagesOptions;
  dependencies?: Record<string, string>;
  files?: Record<string, File>;
  injections?: Array<{ location: CodeInjectionLocation; code: string }>;
  replacements?: Array<{ search: string; replace: string }>;
  packageManager?: string;
  pnpmVersion?: string;
  pnpmManageVersions?: boolean;
  nodeVersion?: string;
};

export type File =
  | {
      type: "text";
      content: string;
    }
  | {
      type: "remote";
      url: string;
    };

export type Linter = "eslint" | "oxlint" | "biome";
export type Formatter = "prettier" | "oxfmt" | "biome";

export type CodeInjectionLocation =
  | "vite-config-import"
  | "import"
  | "global-start"
  | "global-end"
  | "dom-start"
  | "dom"
  | "dom-end"
  | "scene-start"
  | "scene"
  | "scene-end"
  | "readme-start"
  | "readme-end"
  | "readme-libraries"
  | "readme-tools"
  | "readme-commands"
  | "vscode-extension-suggestion"
  | "vscode-setting";

export type Generator = {
  get options(): GenerateOptions;
  get versions(): PackageVersions;
  addDependency(name: string, semver: string): void;
  addFile(path: string, file: File): void;
  addScript(name: string, command: string): void;
  inject(location: CodeInjectionLocation, code: string): void;
  replace(search: string, replace: string): void;
  configureVite(object: any): void;
  addVscodeSetting(key: string, value: unknown): void;
};

export function generate(options: GenerateOptions) {
  //deep cloning since integrations might decide to modify the options
  const clonedOptions = structuredClone(options);
  const template = clonedOptions.template ?? "vanilla";
  const baseTemplate = getBaseTemplate(template);
  const language = getLanguageFromTemplate(template);
  const isVanilla = baseTemplate === "vanilla";
  const isReact = baseTemplate === "react";
  const isR3f = baseTemplate === "r3f";

  const files: Record<string, File> = {
    ...clonedOptions.files,
  };
  const replacements: Array<{ search: string; replace: string }> = clonedOptions.replacements ?? [];

  // Base dependencies - always include vite
  const versions = clonedOptions.versions ?? {};
  const dependencies: Record<string, string> = {
    vite: versions.vite ? `^${versions.vite}` : "^6.3.4",
    ...clonedOptions.dependencies,
  };

  // Add React dependencies for react and r3f templates
  if (isReact || isR3f) {
    dependencies["react"] = "^19.0.0";
    dependencies["react-dom"] = "^19.0.0";
    dependencies["@vitejs/plugin-react"] = "^4.4.1";
  }

  // Add Three.js dependencies for r3f template
  if (isR3f) {
    dependencies["three"] = "~0.175.0";
    dependencies["@react-three/fiber"] = "^9.0.0";
  }

  // TypeScript configuration
  if (language === "typescript") {
    const tsConfig: any = {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        outDir: "dist",
      },
      include: ["src/**/*"],
    };

    // Add JSX config for React templates
    if (isReact || isR3f) {
      tsConfig.compilerOptions.jsx = "react-jsx";
      dependencies["@types/react"] = "^19.0.0";
      dependencies["@types/react-dom"] = "^19.0.0";
    }

    // Add Three.js types for r3f
    if (isR3f) {
      dependencies["@types/three"] = "~0.175.0";
    }

    files["tsconfig.json"] = {
      type: "text",
      content: JSON.stringify(tsConfig, null, 2),
    };
  }

  const codeSnippets: Partial<Record<CodeInjectionLocation, Array<string>>> = {};
  const vscodeSettings: Record<string, unknown> = {};
  const scripts: Record<string, string> = {
    dev: "vite",
    build: "vite build",
  };

  // Setup vite config imports based on template
  if (isReact || isR3f) {
    codeSnippets["vite-config-import"] = ["import react from '@vitejs/plugin-react'"];
  }

  // Setup R3F-specific imports
  if (isR3f) {
    codeSnippets["import"] = [`import { Canvas } from "@react-three/fiber"`];
  }

  const defaultName = isVanilla ? "vanilla-app" : isReact ? "react-app" : "react-three-app";
  const name = clonedOptions.name ?? defaultName;

  // Build vite config based on template
  let viteConfig: any = {
    base: "./",
  };

  if (isReact || isR3f) {
    viteConfig.plugins = ["$raw:react()"];
  }

  if (isR3f) {
    viteConfig.resolve = { dedupe: ["three"] };
  }

  const generator: Generator = {
    options: clonedOptions,
    versions,
    addDependency(name, semver) {
      const existingSemver = dependencies[name];
      if (existingSemver != null) {
        //TODO: intersect existingSemver with semver and write to semver
        //TODO: throw error if no overlap
      }
      dependencies[name] = semver;
    },
    addFile(path, content) {
      files[path] = content;
    },
    addScript(name, command) {
      scripts[name] = command;
    },
    inject(location, code) {
      let entries = codeSnippets[location];
      if (entries == null) {
        codeSnippets[location] = entries = [];
      }
      entries.push(code);
    },
    replace(search, replace) {
      replacements.push({ search, replace });
    },
    configureVite(config) {
      viteConfig = merge(viteConfig, config);
    },
    addVscodeSetting(key, value) {
      vscodeSettings[key] = value;
    },
  };

  // Only run R3F integrations for r3f template
  if (isR3f) {
    generateDrei(generator, clonedOptions.drei);
    generateHandle(generator, clonedOptions.handle);
    generateKoota(generator, clonedOptions.koota);
    generateLeva(generator, clonedOptions.leva);
    generateOffscreen(generator, clonedOptions.offscreen);
    generatePostprocessing(generator, clonedOptions.postprocessing);
    generateRapier(generator, clonedOptions.rapier);
    generateUikit(generator, clonedOptions.uikit);
    generateXr(generator, clonedOptions.xr);
    generateZustand(generator, clonedOptions.zustand);
    generateFiber(generator, clonedOptions.fiber);
    generateTriplex(generator, clonedOptions.triplex);
    generateViverse(generator, clonedOptions.viverse);
  }

  // GitHub Pages works for all templates
  generateGithubPages(generator, clonedOptions.githubPages);

  // Linter and formatter integrations
  const linter = clonedOptions.linter;
  const formatter = clonedOptions.formatter;

  // Generate linter integrations
  if (linter === "eslint") {
    generateEslint(generator, true);
    generator.addVscodeSetting("biome.enabled", false);
    generator.addVscodeSetting("oxc.enable", false);
  } else if (linter === "oxlint") {
    generateOxlint(generator, true);
    generator.addVscodeSetting("eslint.enable", false);
    generator.addVscodeSetting("biome.enabled", false);
  } else if (linter === "biome") {
    generateBiome(generator, { linter: true, formatter: formatter === "biome" });
    generator.addVscodeSetting("eslint.enable", false);
    generator.addVscodeSetting("oxc.enable", false);
  }

  // Generate formatter integrations (skip biome if already handled above)
  if (formatter === "prettier") {
    generatePrettier(generator, true);
  } else if (formatter === "oxfmt") {
    generateOxfmt(generator, true);
  } else if (formatter === "biome" && linter !== "biome") {
    // Only generate biome for formatting if it wasn't already generated for linting
    generateBiome(generator, { linter: false, formatter: true });
    generator.addVscodeSetting("eslint.enable", false);
    generator.addVscodeSetting("oxc.enable", false);
  }

  for (const { code, location } of clonedOptions.injections ?? []) {
    generator.inject(location, code);
  }

  // Generate vite.config.js
  const viteConfigContent = [
    `import { defineConfig } from 'vite'`,
    ...(codeSnippets["vite-config-import"] ?? []),
    `export default defineConfig(${JSON.stringify(viteConfig).replace(/"\$raw:([^"]+)"/g, (_, raw) => raw)})`,
  ].join("\n");

  files["vite.config.js"] = { type: "text", content: viteConfigContent };

  const packageManager = options.packageManager ?? "pnpm";
  const isPnpm = packageManager === "pnpm";

  // Build package.json with conditional pnpm-specific fields
  const packageJson: Record<string, any> = {
    name,
    type: "module",
    dependencies,
    scripts,
  };

  // Add engines field if needed
  const engines: Record<string, string> = {};

  if (isPnpm) {
    const pnpmVersion = options.pnpmVersion ?? "10.11.0";
    const majorVersion = pnpmVersion.split(".")[0];
    engines.pnpm = `>=${majorVersion}.0.0`;
    packageJson.packageManager = `pnpm@${pnpmVersion}`;
  }

  if (options.nodeVersion) {
    const majorVersion = options.nodeVersion.split(".")[0];
    engines.node = `>=${majorVersion}.0.0`;
  }

  if (Object.keys(engines).length > 0) {
    packageJson.engines = engines;
  }

  files["package.json"] = {
    type: "text",
    content: JSON.stringify(packageJson, null, 2),
  };

  // Add pnpm-workspace.yaml when pnpm is selected
  if (isPnpm) {
    const manageVersions = options.pnpmManageVersions ?? true;
    const workspaceLines: string[] = [];

    if (manageVersions) {
      workspaceLines.push("manage-package-manager-versions: true", "");
    }

    workspaceLines.push("onlyBuiltDependencies:", "  - esbuild");

    files["pnpm-workspace.yaml"] = {
      type: "text",
      content: workspaceLines.join("\n"),
    };
  }

  files[".gitignore"] = { type: "text", content: ["node_modules", "dist"].join("\n") };
  files[".gitattributes"] = { type: "text", content: GitAttributes };

  codeSnippets["readme-libraries"] ??= [];
  codeSnippets["readme-commands"] ??= [];

  // Add library descriptions based on template
  if (isVanilla) {
    codeSnippets["readme-libraries"].unshift(
      `[Vite](https://vitejs.dev/) - Next generation frontend tooling`,
    );
  } else if (isReact) {
    codeSnippets["readme-libraries"].unshift(
      `[React](https://react.dev/) - A JavaScript library for building user interfaces`,
      `[Vite](https://vitejs.dev/) - Next generation frontend tooling`,
    );
  } else {
    codeSnippets["readme-libraries"].unshift(
      `[React](https://react.dev/) - A JavaScript library for building user interfaces`,
      `[Three.js](https://threejs.org/) - JavaScript 3D library`,
      `[@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) - lets you create Three.js scenes using React components`,
    );
  }

  codeSnippets["readme-commands"].unshift(
    `\`${packageManager} install\` to install the dependencies`,
    `\`${packageManager} run dev\` to run the development server and preview the app with live updates`,
    `\`${packageManager} run build\` to build the app into the \`dist\` folder`,
  );

  // Generate template-specific architecture description
  const ext = language === "javascript" ? "js" : "ts";
  const jsxExt = language === "javascript" ? "jsx" : "tsx";
  let architectureDesc: string[];
  if (isVanilla) {
    architectureDesc = [
      `- \`src/main.${ext}\` is the entry point for your application`,
      `- Static assets can be placed in the \`public\` folder`,
    ];
  } else if (isReact) {
    architectureDesc = [
      `- \`src/app.${jsxExt}\` defines the main application component`,
      `- \`src/index.${jsxExt}\` renders the React app into the DOM`,
      `- Static assets can be placed in the \`public\` folder`,
    ];
  } else {
    architectureDesc = [
      `- \`app.${jsxExt}\` defines the main application component containing your 3D content`,
      `- Modify the content inside the \`<Canvas>\` component to change what is visible on screen`,
      `- Static assets can be placed in the \`public\` folder`,
    ];
  }

  files[`README.md`] = {
    type: "text",
    content: [
      `# ${name}`,
      `This project was generated with krispya-create`,
      ...(codeSnippets["readme-start"] ?? []),
      "\n",
      `## Project Architecture`,
      `This project uses [Vite](https://vitejs.dev/) as the bundler for fast development and optimized production builds.`,
      ...architectureDesc,
      "\n",
      `## Libraries`,
      `The following libraries are used - checkout the linked docs to learn more`,
      ...(codeSnippets["readme-libraries"] ?? []).map((library) => `- ${library}`),
      "\n",
      codeSnippets["readme-tools"] && `## Tools`,
      ...(codeSnippets["readme-tools"] ?? []).map((tool) => `- ${tool}`),
      codeSnippets["readme-tools"] && `\n`,
      `## Development Commands`,
      ...(codeSnippets["readme-commands"] ?? []).map((command) => `- ${command}`),
      ...(codeSnippets["readme-end"] ?? []),
    ]
      .filter(Boolean)
      .join("\n"),
  };

  // Generate template-specific source files
  if (isVanilla) {
    // Vanilla template
    const ext = language === "javascript" ? "js" : "ts";
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
    files[".vscode/settings.json"] = {
      type: "text",
      content: JSON.stringify(vscodeSettings, null, "\t"),
    };
  }

  if (language === "javascript") {
    //TODO: transpile tsx? to jsx? files}
  }
  //TODO: execute prettier on ts(x), js(x), and json files``

  return files;
}
