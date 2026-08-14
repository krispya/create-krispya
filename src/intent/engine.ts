import type { EngineSpec } from '../types.js';

export function getEngineSpec(engine?: EngineSpec): EngineSpec {
  return engine ?? { name: 'node' };
}

export function getEngineName(engine?: EngineSpec): string {
  return getEngineSpec(engine).name;
}

export function formatEngine(engine?: EngineSpec): string {
  const spec = getEngineSpec(engine);
  return spec.version ? `${spec.name}@${spec.version}` : spec.name;
}

export function parseEngine(engines?: Record<string, string>): EngineSpec | undefined {
  if (engines == null) {
    return undefined;
  }

  const [name, range] =
    Object.entries(engines).find(
      ([engineName]) => engineName !== 'npm' && engineName !== 'pnpm' && engineName !== 'yarn'
    ) ?? [];

  if (name == null) {
    return undefined;
  }

  const version = range?.match(/(\d+(?:\.\d+(?:\.\d+)?)?)/)?.[1];
  return { name, version };
}
