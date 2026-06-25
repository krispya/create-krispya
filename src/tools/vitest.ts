import {
  getBaseTemplate,
  type PlanBuilder,
  type TestingMetaConfig,
  type ToolConfig,
} from '../types.js';
import { packageJsonScripts } from '../renderers/package-json-scripts.js';

export type PlanVitestOptions = ToolConfig<'vitest', TestingMetaConfig>;

export function planVitest(builder: PlanBuilder, options: PlanVitestOptions | undefined) {
  if (options == null) {
    return;
  }

  builder.addDevDependency('vitest');

  const template = builder.options.template ?? 'vanilla';
  const baseTemplate = getBaseTemplate(template);
  const isReact = baseTemplate === 'react' || baseTemplate === 'r3f';

  // Add React Testing Library for React/R3F templates
  if (isReact) {
    builder.addDevDependency('@testing-library/react');
    builder.addDevDependency('@testing-library/dom');
    builder.addDevDependency('jsdom');
  }

  // Merge vitest config into vite config (only if needed)
  if (isReact) {
    builder.configureVite({ test: { environment: 'jsdom' } });
  }

  builder.addScripts(packageJsonScripts.test.vitest);
  builder.inject(
    'readme-tools',
    '[Vitest](https://vitest.dev/) - Fast unit test framework powered by Vite'
  );
}
