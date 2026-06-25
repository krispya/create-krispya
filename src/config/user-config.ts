import Conf from 'conf';
import type { AiPlatform, ConfigStrategy } from '../types.js';

export type { AiPlatform } from '../types.js';

interface Schema {
  /** Selected AI platforms to generate files for */
  aiPlatforms?: AiPlatform[];
  configStrategy?: ConfigStrategy;
}

const config = new Conf<Schema>({
  projectName: 'create-krispya',
});

export function getAiPlatforms(): AiPlatform[] | undefined {
  return config.get('aiPlatforms');
}

export function setAiPlatforms(platforms: AiPlatform[]): void {
  config.set('aiPlatforms', platforms);
}

export function getConfigStrategy(): ConfigStrategy {
  return config.get('configStrategy') ?? 'stealth';
}

export function setConfigStrategy(strategy: ConfigStrategy): void {
  config.set('configStrategy', strategy);
}

export function clearConfig(): void {
  config.clear();
}

export function getConfigPath(): string {
  return config.path;
}
