import type { Generator } from '../index.js'
import chalk from 'chalk'

export type GenerateOffscreenOptions = {} | boolean

export function generateOffscreen(generator: Generator, options: GenerateOffscreenOptions | undefined) {
  if (options == null) {
    return
  }
  if (generator.options.xr != null) {
    console.info(chalk.blue('Info:'), '@react-three/offscreen is disabled because it is not supported with XR')
    return
  }
  generator.addDependency('@react-three/offscreen', '^0.0.8')
  generator.inject("readme-libraries", `[@react-three/offscreen](https://github.com/pmndrs/offscreen) - Offload your scene to a worker thread for better performance`,)
}
