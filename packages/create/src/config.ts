import Conf from "conf";

export type EditorChoice = "cursor" | "code" | "webstorm" | "skip";

interface Schema {
  preferredEditor?: EditorChoice;
  reuseWindow?: boolean;
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
