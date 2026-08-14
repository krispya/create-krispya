import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fetch } from 'undici';

import type { VirtualFile } from '../types.js';

/**
 * Writes generated files to disk.
 */
export async function writeGeneratedFiles(
  basePath: string,
  files: Record<string, VirtualFile>
): Promise<void> {
  const filePaths = Object.keys(files).sort();

  for (const filePath of filePaths) {
    const fullFilePath = join(basePath, filePath);
    await mkdir(dirname(fullFilePath), { recursive: true });
    const file = files[filePath]!;

    if (file.type === 'text') {
      await writeFile(fullFilePath, file.content);
    } else {
      const response = await fetch(file.url);
      await writeFile(fullFilePath, response.body!);
    }
  }
}
