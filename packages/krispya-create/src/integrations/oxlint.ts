import type { Generator } from '../index.js'

export type GenerateOxlintOptions = {} | boolean

export function generateOxlint(generator: Generator, options: GenerateOxlintOptions | undefined) {
  if (options == null) {
    return
  }

  const version = generator.versions.oxlint ?? '0.16.0'
  generator.addDependency('oxlint', `^${version}`)

  // Add oxlint config
  const oxlintConfig = {
    $schema: './node_modules/oxlint/configuration_schema.json',
    rules: {},
  }

  generator.addFile('oxlint.json', {
    type: 'text',
    content: JSON.stringify(oxlintConfig, null, 2),
  })

  generator.inject('readme-tools', '[Oxlint](https://oxc.rs/docs/guide/usage/linter) - A fast linter for JavaScript and TypeScript')
  generator.inject('vscode-extension-suggestion', 'oxc.oxc-vscode')
  generator.addVscodeSetting('oxc.enable', true)
}

