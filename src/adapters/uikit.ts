import type { PlanUikitOptions, PlanBuilder } from '../types.js';

export function planUikit(builder: PlanBuilder, options: PlanUikitOptions | undefined) {
    if (options == null) {
        return;
    }
    builder.addDependency('@react-three/uikit');
    builder.inject(
        'readme-libraries',
        `[@react-three/uikit](https://pmndrs.github.io/uikit/docs/) - UI primitives for React Three Fiber`
    );
}
