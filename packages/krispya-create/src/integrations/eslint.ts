import type { Generator } from '../index.js'

export type GenerateEslintOptions = {} | boolean

export function generateEslint(generator: Generator, options: GenerateEslintOptions | undefined) {
  if (options == null) {
    return
  }

  const version = generator.versions.eslint ?? '9.17.0'
  generator.addDependency('eslint', `^${version}`)

  // Add eslint flat config
  const isTypescript = generator.options.language === 'typescript'
  const isReact = generator.options.template === 'react' || generator.options.template === 'r3f'

  const imports: string[] = ['import js from "@eslint/js"']
  const configs: string[] = ['js.configs.recommended']

  if (isTypescript) {
    generator.addDependency('typescript-eslint', '^8.18.0')
    imports.push('import tseslint from "typescript-eslint"')
    configs.push('...tseslint.configs.recommended')
  }

  if (isReact) {
    generator.addDependency('eslint-plugin-react-hooks', '^5.1.0')
    imports.push('import reactHooks from "eslint-plugin-react-hooks"')
  }

  const configContent = [
    ...imports,
    '',
    'export default [',
    `  ${configs.join(',\n  ')},`,
    isReact
      ? `  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: reactHooks.configs.recommended.rules,
  },`
      : '',
    ']',
  ]
    .filter(Boolean)
    .join('\n')

  generator.addFile('eslint.config.js', {
    type: 'text',
    content: configContent,
  })

  // Add lint script
  generator.inject('readme-tools', '[ESLint](https://eslint.org/) - Linter for JavaScript and TypeScript')
  generator.inject('vscode-extension-suggestion', 'dbaeumer.vscode-eslint')
  generator.addVscodeSetting('eslint.enable', true)
}

