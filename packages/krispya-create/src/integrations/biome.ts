import { defaultFormatterConfig } from '../constants.js'
import type { Generator } from '../index.js'

export type GenerateBiomeOptions = {
  /** Whether biome is used as a linter */
  linter?: boolean
  /** Whether biome is used as a formatter */
  formatter?: boolean
}

export function generateBiome(generator: Generator, options: GenerateBiomeOptions | undefined) {
  if (options == null || (!options.linter && !options.formatter)) {
    return
  }

  const version = generator.versions.biome ?? '1.9.4'
  generator.addDependency('@biomejs/biome', `^${version}`)

  // Build biome config based on roles
  const biomeConfig: Record<string, unknown> = {
    $schema: 'https://biomejs.dev/schemas/1.9.4/schema.json',
  }

  if (options.linter) {
    biomeConfig.linter = {
      enabled: true,
      rules: {
        recommended: true,
      },
    }
  } else {
    biomeConfig.linter = {
      enabled: false,
    }
  }

  if (options.formatter) {
    // Translate common formatter settings to Biome format
    biomeConfig.formatter = {
      enabled: true,
      lineWidth: defaultFormatterConfig.printWidth,
      indentWidth: defaultFormatterConfig.tabWidth,
      indentStyle: defaultFormatterConfig.useTabs ? 'tab' : 'space',
    }
    biomeConfig.javascript = {
      formatter: {
        semicolons: defaultFormatterConfig.semi ? 'always' : 'asNeeded',
        quoteStyle: defaultFormatterConfig.singleQuote ? 'single' : 'double',
        trailingCommas: defaultFormatterConfig.trailingComma,
        bracketSpacing: defaultFormatterConfig.bracketSpacing,
        arrowParentheses: defaultFormatterConfig.arrowParens === 'always' ? 'always' : 'asNeeded',
      },
    }
  } else {
    biomeConfig.formatter = {
      enabled: false,
    }
  }

  generator.addFile('biome.json', {
    type: 'text',
    content: JSON.stringify(biomeConfig, null, 2),
  })

  const roles: string[] = []
  if (options.linter) roles.push('linter')
  if (options.formatter) roles.push('formatter')

  generator.inject(
    'readme-tools',
    `[Biome](https://biomejs.dev/) - Fast ${roles.join(' and ')} for JavaScript and TypeScript`
  )
  generator.inject('vscode-extension-suggestion', 'biomejs.biome')
  generator.addVscodeSetting('biome.enabled', true)

  if (options.formatter) {
    generator.addVscodeSetting('editor.defaultFormatter', 'biomejs.biome')
  }
}

