import { describe, expect, it } from 'vitest';
import { formatConfigSummary } from '../src/cli/format.js';

describe('formatConfigSummary', () => {
  it('shows React Compiler in the framework value when enabled', () => {
    const summary = formatConfigSummary({
      name: 'my-app',
      template: 'react',
    });

    expect(summary).toMatch(/Framework \.+ React \+ compiler/);
    expect(summary).not.toContain('React compiler');
  });

  it('shows plain React when React Compiler is not enabled', () => {
    const summary = formatConfigSummary({
      name: 'my-lib',
      projectType: 'library',
      template: 'react',
    });

    expect(summary).toMatch(/Framework \.+ React/);
    expect(summary).not.toContain('React + compiler');
    expect(summary).not.toContain('React compiler');
  });
});
