import { packageJsonScripts } from '../renderers/package-json-scripts.js';
import type { FormatterMetaConfig, LinterMetaConfig, PlanBuilder, ToolConfig } from '../types.js';

export type PlanBiomeOptions = {
  linter?: ToolConfig<'biome', LinterMetaConfig>;
  formatter?: ToolConfig<'biome', FormatterMetaConfig>;
};

// Helper to convert level to Biome format
function toBiomeLevel(level: 'off' | 'warn' | 'error'): string {
  return level;
}

export function planBiome(builder: PlanBuilder, options: PlanBiomeOptions | undefined) {
  if (options == null || (!options.linter && !options.formatter)) {
    return;
  }

  const version = builder.getVersion('@biomejs/biome');
  builder.addDevDependency('@biomejs/biome');

  // Build biome config based on roles
  // Note: Biome v2 ignores dist/node_modules by default, no need to specify
  const biomeConfig: Record<string, unknown> = {
    $schema: `https://biomejs.dev/schemas/${version}/schema.json`,
  };

  if (options.linter) {
    const linterConfig = options.linter.config;

    biomeConfig.linter = {
      enabled: true,
      rules: {
        recommended: true,
        correctness: {
          noUnusedVariables: toBiomeLevel(linterConfig.rules.noUnusedVars.level),
        },
      },
    };
  } else {
    biomeConfig.linter = {
      enabled: false,
    };
  }

  if (options.formatter) {
    const formatterConfig = options.formatter.config;

    // Translate common formatter settings to Biome format
    biomeConfig.formatter = {
      enabled: true,
      lineWidth: formatterConfig.printWidth,
      indentWidth: formatterConfig.tabWidth,
      indentStyle: formatterConfig.useTabs ? 'tab' : 'space',
    };
    biomeConfig.javascript = {
      formatter: {
        semicolons: formatterConfig.semi ? 'always' : 'asNeeded',
        quoteStyle: formatterConfig.singleQuote ? 'single' : 'double',
        trailingCommas: formatterConfig.trailingComma,
        bracketSpacing: formatterConfig.bracketSpacing,
        arrowParentheses: formatterConfig.arrowParens === 'always' ? 'always' : 'asNeeded',
      },
    };
    // JSON uses 2-space indentation
    biomeConfig.json = {
      formatter: {
        indentWidth: 2,
      },
    };
  } else {
    biomeConfig.formatter = {
      enabled: false,
    };
  }

  const isStealth = builder.isStealthConfig();

  if (isStealth) {
    builder.addFile('.config/biome.json', {
      type: 'text',
      content: JSON.stringify(biomeConfig, null, 2),
    });
    if (options.linter) {
      builder.addScripts(packageJsonScripts.lint.biome('.config'));
    }
    if (options.formatter) {
      builder.addScripts(packageJsonScripts.format.biome('.config'));
    }
  } else {
    builder.addFile('biome.json', {
      type: 'text',
      content: JSON.stringify(biomeConfig, null, 2),
    });
    if (options.linter) {
      builder.addScripts(packageJsonScripts.lint.biome());
    }
    if (options.formatter) {
      builder.addScripts(packageJsonScripts.format.biome());
    }
  }

  const roles: string[] = [];
  if (options.linter) roles.push('linter');
  if (options.formatter) roles.push('formatter');

  builder.inject(
    'readme-tools',
    `[Biome](https://biomejs.dev/) - Fast ${roles.join(' and ')} for JavaScript and TypeScript`
  );
  builder.inject('vscode-extension-suggestion', 'biomejs.biome');
}
