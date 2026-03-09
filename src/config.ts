import Conf from 'conf';
import type {
    AiPlatform,
    BaseTemplate,
    ConfigStrategy,
    Formatter,
    Linter,
    Testing,
} from './types.js';

export type EditorChoice = 'cursor' | 'code' | 'webstorm' | 'skip';

export type { AiPlatform } from './types.js';

export interface CustomTemplate {
    baseTemplate: BaseTemplate;
    linter: Linter;
    formatter: Formatter;
    testing: Testing;
    configStrategy?: ConfigStrategy;
    integrations?: string[];
}

interface Schema {
    preferredEditor?: EditorChoice;
    reuseWindow?: boolean;
    customTemplates?: Record<string, CustomTemplate>;
    /** Selected AI platforms to generate files for */
    aiPlatforms?: AiPlatform[];
    configStrategy?: ConfigStrategy;
}

const config = new Conf<Schema>({
    projectName: 'create-krispya',
});

export function getPreferredEditor(): EditorChoice | undefined {
    return config.get('preferredEditor');
}

export function setPreferredEditor(editor: EditorChoice): void {
    config.set('preferredEditor', editor);
}

export function getReuseWindow(): boolean {
    return config.get('reuseWindow') ?? false;
}

export function setReuseWindow(reuse: boolean): void {
    config.set('reuseWindow', reuse);
}

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

export function getCustomTemplates(): Record<string, CustomTemplate> {
    return config.get('customTemplates') ?? {};
}

export function getCustomTemplate(name: string): CustomTemplate | undefined {
    const templates = getCustomTemplates();
    return templates[name];
}

export function saveCustomTemplate(name: string, template: CustomTemplate): void {
    const templates = getCustomTemplates();
    templates[name] = template;
    config.set('customTemplates', templates);
}

export function deleteCustomTemplate(name: string): boolean {
    const templates = getCustomTemplates();
    if (templates[name] == null) {
        return false;
    }
    delete templates[name];
    config.set('customTemplates', templates);
    return true;
}
