import type { Generator } from '../index.js'

export type GenerateOxfmtOptions = {} | boolean

export function generateOxfmt(generator: Generator, options: GenerateOxfmtOptions | undefined) {
  if (options == null) {
    return
  }

  generator.addDependency('oxfmt', '^0.1.0')

  // Add oxfmt config (Prettier-compatible format)
  const oxfmtConfig = {
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
  }

  generator.addFile('.oxfmt.json', {
    type: 'text',
    content: JSON.stringify(oxfmtConfig, null, 2),
  })

  generator.inject('readme-tools', '[Oxfmt](https://oxc.rs/docs/guide/usage/formatter) - Fast Prettier-compatible code formatter')
  generator.inject('vscode-extension-suggestion', 'oxc.oxc-vscode')
  generator.addVscodeSetting('editor.defaultFormatter', 'oxc.oxc-vscode')
}

