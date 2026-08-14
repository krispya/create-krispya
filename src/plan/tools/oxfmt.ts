import { packageJsonScripts } from '../renderers/package-json-scripts.js';
import { renderJson } from '../renderers/json.js';
import type { FormatterMetaConfig, PlanBuilder, ToolConfig } from '../../types.js';
import { toOxfmtConfig } from './formatter-config.js';

export type PlanOxfmtOptions = ToolConfig<'oxfmt', FormatterMetaConfig>;

export function planOxfmt(builder: PlanBuilder, options: PlanOxfmtOptions | undefined) {
  if (options == null) {
    return;
  }

  // Check if we're in a monorepo context (workspaceRoot is set)
  const isMonorepo = builder.options.workspaceRoot != null;

  if (isMonorepo) {
    // Use @config/oxfmt package from workspace (oxfmt itself is at root)
    builder.addDevDependency('@config/oxfmt', { version: 'workspace:*' });

    const configPath = 'node_modules/@config/oxfmt/base.json';

    builder.addScripts(packageJsonScripts.format.oxfmt(configPath));
  } else {
    // Single-package workspace: add oxfmt as devDependency
    builder.addDevDependency('oxfmt');

    const isStealth = builder.isStealthConfig();

    if (isStealth) {
      builder.addFile('.config/oxfmt.json', {
        type: 'text',
        content: renderJson(toOxfmtConfig(options.config)),
      });
      builder.addScripts(packageJsonScripts.format.oxfmt('.config/oxfmt.json'));
    } else {
      builder.addFile('oxfmt.json', {
        type: 'text',
        content: renderJson(toOxfmtConfig(options.config)),
      });
      builder.addScripts(packageJsonScripts.format.oxfmt('oxfmt.json'));
    }
  }

  builder.inject(
    'readme-tools',
    '[Oxfmt](https://oxc.rs/docs/guide/usage/formatter) - Fast Prettier-compatible code formatter'
  );
  builder.inject('vscode-extension-suggestion', 'oxc.oxc-vscode');
}
