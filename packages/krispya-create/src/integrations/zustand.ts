import type { Generator } from '../index.js'

export type GenerateZustandOptions = {
  /**
   * @default true
   */
  addExample?: boolean
} | boolean

export function generateZustand(generator: Generator, options: GenerateZustandOptions | undefined) {
  if (options == null) {
    return
  }
  generator.addDependency('zustand', '^5.0.3')
  generator.inject("readme-libraries", `[zustand](https://zustand.docs.pmnd.rs/) - small, fast and scalable state-management solution`,)
}
