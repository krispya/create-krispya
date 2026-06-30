import { toPrettierConfig, toPrettierIgnoreContent } from './formatter-config.js';
import { renderJson } from '../renderers/json.js';
import { packageJsonScripts } from '../renderers/package-json-scripts.js';
import type { FormatterMetaConfig, PlanBuilder, ToolConfig } from '../types.js';

export type PlanPrettierOptions = ToolConfig<'prettier', FormatterMetaConfig>;

export function planPrettier(builder: PlanBuilder, options: PlanPrettierOptions | undefined) {
  if (options == null) {
    return;
  }

  builder.addDevDependency('prettier');

  const isStealth = builder.isStealthConfig();

  if (isStealth) {
    builder.addFile('.config/prettier.json', {
      type: 'text',
      content: renderJson(toPrettierConfig(options.config)),
    });
    builder.addFile('.config/prettierignore', {
      type: 'text',
      content: toPrettierIgnoreContent(options.config),
    });
    builder.addScripts(
      packageJsonScripts.format.prettier('.config/prettier.json', '.config/prettierignore')
    );
  } else {
    builder.addFile('.prettierrc', {
      type: 'text',
      content: renderJson(toPrettierConfig(options.config)),
    });
    builder.addFile('.prettierignore', {
      type: 'text',
      content: toPrettierIgnoreContent(options.config),
    });
    builder.addScripts(packageJsonScripts.format.prettier());
  }

  builder.inject('readme-tools', '[Prettier](https://prettier.io/) - Opinionated code formatter');
  builder.inject('vscode-extension-suggestion', 'esbenp.prettier-vscode');
}
