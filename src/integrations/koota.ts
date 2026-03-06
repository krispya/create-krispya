import type { GenerateKootaOptions, Generator } from "../types.js";

export function generateKoota(generator: Generator, options: GenerateKootaOptions | undefined) {
  if (options == null) {
    return;
  }
  generator.addDependency("koota", "^0.4.0");
  generator.inject(
    "readme-libraries",
    `[koota](https://github.com/pmndrs/koota) - ECS-based state management library optimized for real-time apps, games, and XR experiences`,
  );
}
