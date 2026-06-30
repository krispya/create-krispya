import type { VirtualFile } from '../types.js';

export type GitignoreVariant = 'standalone' | 'workspace-root';

export const GITIGNORE_MANAGED_BEGIN = '# create-krispya managed ignores: begin';
export const GITIGNORE_MANAGED_END = '# create-krispya managed ignores: end';

const COMMON_GITIGNORE_LINES = [
  'node_modules',
  'dist',
  '*.tsbuildinfo',
  '.env',
  '.env.*',
  '!.env.example',
  '.pnpm-store',
];

export type GitignoreMergeResult = {
  content: string;
  mergeSafe: boolean;
};

export function getCoreGitignoreLines(variant: GitignoreVariant): string[] {
  return variant === 'workspace-root'
    ? [...COMMON_GITIGNORE_LINES, '.DS_Store']
    : COMMON_GITIGNORE_LINES;
}

export function renderManagedGitignoreBlock(variant: GitignoreVariant): string {
  return [
    GITIGNORE_MANAGED_BEGIN,
    ...getCoreGitignoreLines(variant),
    GITIGNORE_MANAGED_END,
  ].join('\n');
}

export function renderGitignore(variant: GitignoreVariant): VirtualFile {
  return {
    type: 'text',
    content: renderManagedGitignoreBlock(variant),
  };
}

function getManagedBlockRange(content: string) {
  const beginIndex = content.indexOf(GITIGNORE_MANAGED_BEGIN);
  const endIndex = content.indexOf(GITIGNORE_MANAGED_END);

  if (beginIndex === -1 && endIndex === -1) {
    return { status: 'missing' as const };
  }

  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    return { status: 'conflicted' as const };
  }

  return {
    status: 'found' as const,
    beginIndex,
    endIndex: endIndex + GITIGNORE_MANAGED_END.length,
  };
}

function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start]?.trim() === '') {
    start++;
  }

  while (end > start && lines[end - 1]?.trim() === '') {
    end--;
  }

  return lines.slice(start, end);
}

export function mergeGitignoreContent(
  currentContent: string,
  variant: GitignoreVariant
): GitignoreMergeResult {
  const managedBlock = renderManagedGitignoreBlock(variant);
  const range = getManagedBlockRange(currentContent);

  if (range.status === 'found') {
    return {
      content: `${currentContent.slice(0, range.beginIndex)}${managedBlock}${currentContent.slice(
        range.endIndex
      )}`,
      mergeSafe: true,
    };
  }

  if (range.status === 'conflicted') {
    return {
      content: managedBlock,
      mergeSafe: false,
    };
  }

  const coreLines = new Set(getCoreGitignoreLines(variant));
  const customLines = trimBlankEdges(
    currentContent.split(/\r?\n/).filter((line) => !coreLines.has(line.trim()))
  );

  return {
    content: customLines.length > 0 ? `${managedBlock}\n\n${customLines.join('\n')}` : managedBlock,
    mergeSafe: true,
  };
}

export function detectGitignoreVariant(content: string): GitignoreVariant {
  return content.split(/\r?\n/).includes('.DS_Store') ? 'workspace-root' : 'standalone';
}
