import type { GenerateHandleOptions, Generator } from "../types.js";

export function generateHandle(generator: Generator, options: GenerateHandleOptions | undefined) {
  if (options == null) {
    return;
  }
  generator.addDependency("@react-three/handle", "^6.6.16");
  generator.inject(
    "readme-libraries",
    `[@react-three/handle](https://pmndrs.github.io/xr/docs/handles/introduction) - interactive controls and handles for your 3D objects`,
  );
}
