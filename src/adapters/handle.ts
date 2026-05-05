import type { PlanHandleOptions, PlanBuilder } from '../types.js';

export function planHandle(builder: PlanBuilder, options: PlanHandleOptions | undefined) {
    if (options == null) {
        return;
    }
    builder.addDependency('@react-three/handle');
    builder.inject(
        'readme-libraries',
        `[@react-three/handle](https://pmndrs.github.io/xr/docs/handles/introduction) - interactive controls and handles for your 3D objects`
    );
}
