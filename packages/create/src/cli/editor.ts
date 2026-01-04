import { spawn } from "child_process";

export type EditorType = "cursor" | "code" | "webstorm";

export const editorNames: Record<EditorType | "skip", string> = {
  cursor: "Cursor",
  code: "VS Code",
  webstorm: "WebStorm",
  skip: "Skip",
};

/**
 * Opens a project directory in the specified editor.
 */
export function openInEditor(
  editor: EditorType,
  path: string,
  reuseWindow: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    // Only VS Code and Cursor support the -r flag
    const useReuseFlag = reuseWindow && (editor === "cursor" || editor === "code");
    const args = useReuseFlag ? ["-r", path] : [path];

    const child = isWindows
      ? spawn(`${editor} ${useReuseFlag ? "-r " : ""}"${path}"`, {
          detached: true,
          stdio: "ignore",
          shell: true,
        })
      : spawn(editor, args, {
          detached: true,
          stdio: "ignore",
        });
    child.on("error", reject);
    child.unref();
    setTimeout(resolve, 100);
  });
}
