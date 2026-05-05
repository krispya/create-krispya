import type { PlanLevaOptions, PlanBuilder } from '../types.js';

export function planLeva(builder: PlanBuilder, options: PlanLevaOptions | undefined) {
    if (options == null) {
        return;
    }
    builder.addDependency('leva');
    builder.inject(
        'readme-libraries',
        `[leva](https://github.com/pmndrs/leva) - HTML GUI panel for React with lightweight, beautiful and extensible controls`
    );
}
