import type { Generator } from '../index.js'

export type GeneratePrettierOptions = {} | boolean

export function generatePrettier(generator: Generator, options: GeneratePrettierOptions | undefined) {
  if (options == null) {
    return
  }

  generator.addDependency('prettier', '^3.4.2')

  // Add prettier config
  const prettierConfig = {
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
  }

  generator.addFile('.prettierrc', {
    type: 'text',
    content: JSON.stringify(prettierConfig, null, 2),
  })

  generator.inject('readme-tools', '[Prettier](https://prettier.io/) - Opinionated code formatter')
  generator.inject('vscode-extension-suggestion', 'esbenp.prettier-vscode')
  generator.addVscodeSetting('editor.defaultFormatter', 'esbenp.prettier-vscode')
}

