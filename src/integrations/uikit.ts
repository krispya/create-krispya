import type { GenerateUikitOptions, Generator } from "../types.js";

export function generateUikit(generator: Generator, options: GenerateUikitOptions | undefined) {
  if (options == null) {
    return;
  }
  generator.addDependency("@react-three/uikit", "^0.8.15");
  generator.inject(
    "readme-libraries",
    `[@react-three/uikit](https://pmndrs.github.io/uikit/docs/) - UI primitives for React Three Fiber`,
  );
}
