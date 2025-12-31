import type { Generator } from '../index.js'

export type GenerateLevaOptions = {} | boolean

export function generateLeva(generator: Generator, options: GenerateLevaOptions | undefined) {
  if (options == null) {
    return
  }
  generator.addDependency('leva', '^0.10.0')
  generator.inject("readme-libraries", `[leva](https://github.com/pmndrs/leva) - HTML GUI panel for React with lightweight, beautiful and extensible controls`,)
}
