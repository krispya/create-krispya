import type { VirtualFileMap } from '../../types.js';
import type { PlanJob } from './types.js';

export function materializeJobs(jobs: PlanJob[]): VirtualFileMap {
  const files: VirtualFileMap = {};

  for (const job of jobs) {
    if (job.type === 'write-file') {
      files[job.path] = job.file;
    } else if (job.type === 'merge-pnpm-workspace') {
      files[job.path] = {
        type: 'text',
        content: job.content,
      };
    }
  }

  return files;
}
