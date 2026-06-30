import { describe, expect, it } from 'vitest';
import { renderJson } from '../src/renderers/json.js';

describe('renderJson', () => {
  it('inlines short primitive arrays', () => {
    expect(
      renderJson({
        recommendations: ['oxc.oxc-vscode', 'esbenp.prettier-vscode'],
      })
    ).toBe(`{
  "recommendations": ["oxc.oxc-vscode", "esbenp.prettier-vscode"]
}
`);
  });

  it('keeps arrays expanded when requested', () => {
    expect(
      renderJson(
        {
          files: ['base.json', 'app.json'],
        },
        { inlineArrays: false }
      )
    ).toBe(`{
  "files": [
    "base.json",
    "app.json"
  ]
}
`);
  });
});
