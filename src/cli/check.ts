import color from 'chalk';

import { validateWorkspace } from '../validate.js';
import { detectMonorepoRoot } from './workspace-utils.js';

export async function handleCheckCommand(): Promise<void> {
    const monorepoRoot = await detectMonorepoRoot();
    if (!monorepoRoot) {
        console.log(color.red('✗') + ' Not a monorepo workspace');
        process.exit(1);
    }
    const { valid, errors } = await validateWorkspace(monorepoRoot);
    if (valid) {
        console.log(color.green('✓') + ' Valid monorepo workspace');
        console.log(color.dim(`  ${monorepoRoot}`));
    } else {
        console.log(color.red('✗') + ' Invalid monorepo workspace');
        console.log(color.dim(`  ${monorepoRoot}`));
        for (const error of errors) {
            console.log(color.red(`  • ${error}`));
        }
    }
    process.exit(valid ? 0 : 1);
}
