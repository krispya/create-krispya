import { getBaseTemplate, type Generator } from "../types.js";

export function generateVitest(generator: Generator) {
  const version = generator.versions.vitest ?? "4.0.0"; // fallback if not fetched
  generator.addDevDependency("vitest", `^${version}`);

  const template = generator.options.template ?? "vanilla";
  const baseTemplate = getBaseTemplate(template);
  const isReact = baseTemplate === "react" || baseTemplate === "r3f";

  // Add React Testing Library for React/R3F templates
  if (isReact) {
    generator.addDevDependency("@testing-library/react", "^16.2.0");
    generator.addDevDependency("@testing-library/dom", "^10.4.0");
    generator.addDevDependency("jsdom", "^26.0.0");
  }

  // Merge vitest config into vite config (only if needed)
  if (isReact) {
    generator.configureVite({ test: { environment: "jsdom" } });
  }

  generator.addScript("test", "vitest");
  generator.inject(
    "readme-tools",
    "[Vitest](https://vitest.dev/) - Fast unit test framework powered by Vite",
  );
}

