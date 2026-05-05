import type { PartialPlan, ProjectPlan } from './types.js';

const emptyPlan = (): ProjectPlan => ({
    files: {},
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    scripts: {},
    vscodeSettings: {},
    vscodeExtensions: [],
    injections: [],
    replacements: [],
    warnings: [],
});

export function mergePartialPlans(...plans: Array<PartialPlan | undefined>): ProjectPlan {
    const merged = emptyPlan();

    for (const plan of plans) {
        if (plan == null) continue;

        Object.assign(merged.files, plan.files);
        Object.assign(merged.dependencies, plan.dependencies);
        Object.assign(merged.devDependencies, plan.devDependencies);
        Object.assign(merged.peerDependencies, plan.peerDependencies);
        Object.assign(merged.scripts, plan.scripts);
        Object.assign(merged.vscodeSettings, plan.vscodeSettings);

        merged.vscodeExtensions.push(...(plan.vscodeExtensions ?? []));
        merged.injections.push(...(plan.injections ?? []));
        merged.replacements.push(...(plan.replacements ?? []));
        merged.warnings.push(...(plan.warnings ?? []));
    }

    merged.vscodeExtensions = [...new Set(merged.vscodeExtensions)];

    return merged;
}
