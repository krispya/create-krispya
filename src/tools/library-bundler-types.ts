import type { ConfigStrategy, Template, VirtualFile } from '../types.js';

export type LibraryBundlerBuildOptions = {
  template?: Template;
  configStrategy?: ConfigStrategy;
  workspaceRoot?: string;
  typescriptConfigPath?: string | null;
};

export type LibraryBundlerBuildArtifacts = {
  files: Record<string, VirtualFile>;
  scripts: Record<string, string>;
};
