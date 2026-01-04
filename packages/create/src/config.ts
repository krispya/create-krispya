import Conf from "conf";
import type { BaseTemplate, Formatter, Linter, Testing } from "./types.js";

export type EditorChoice = "cursor" | "code" | "webstorm" | "skip";

export interface CustomTemplate {
  baseTemplate: BaseTemplate;
  linter: Linter;
  formatter: Formatter;
  testing: Testing;
  integrations?: string[];
}

interface Schema {
  preferredEditor?: EditorChoice;
  reuseWindow?: boolean;
  customTemplates?: Record<string, CustomTemplate>;
}

const config = new Conf<Schema>({
  projectName: "create-krispya",
});

export function getPreferredEditor(): EditorChoice | undefined {
  return config.get("preferredEditor");
}

export function setPreferredEditor(editor: EditorChoice): void {
  config.set("preferredEditor", editor);
}

export function getReuseWindow(): boolean {
  return config.get("reuseWindow") ?? false;
}

export function setReuseWindow(reuse: boolean): void {
  config.set("reuseWindow", reuse);
}

export function clearConfig(): void {
  config.clear();
}

export function getConfigPath(): string {
  return config.path;
}

export function getCustomTemplates(): Record<string, CustomTemplate> {
  return config.get("customTemplates") ?? {};
}

export function getCustomTemplate(name: string): CustomTemplate | undefined {
  const templates = getCustomTemplates();
  return templates[name];
}

export function saveCustomTemplate(name: string, template: CustomTemplate): void {
  const templates = getCustomTemplates();
  templates[name] = template;
  config.set("customTemplates", templates);
}

export function deleteCustomTemplate(name: string): boolean {
  const templates = getCustomTemplates();
  if (templates[name] == null) {
    return false;
  }
  delete templates[name];
  config.set("customTemplates", templates);
  return true;
}
