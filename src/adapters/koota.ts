import type { PlanKootaOptions, PlanBuilder } from '../types.js';

export function planKoota(builder: PlanBuilder, options: PlanKootaOptions | undefined) {
    if (options == null) {
        return;
    }
    builder.addDependency('koota');
    builder.inject(
        'readme-libraries',
        `[koota](https://github.com/pmndrs/koota) - ECS-based state management library optimized for real-time apps, games, and XR experiences`
    );
}
