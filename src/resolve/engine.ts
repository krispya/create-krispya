import type { ProjectOptions } from '../types.js';
import { getEngineSpec } from '../intent/engine.js';
import { getLatestNodeVersion } from './registry.js';

export async function resolveEngine(options: ProjectOptions) {
  const engine = getEngineSpec(options.engine);
  if ((engine.version == null || engine.version === 'latest') && engine.name === 'node') {
    engine.version = await getLatestNodeVersion();
  }
  return engine;
}
