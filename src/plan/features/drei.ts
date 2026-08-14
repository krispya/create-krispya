import type { PlanDreiOptions, PlanBuilder } from '../../types.js';

export function planDrei(builder: PlanBuilder, options: PlanDreiOptions | undefined) {
  if (options == null) {
    return;
  }
  builder.addDependency('@react-three/drei');
  builder.inject('import', `import { Environment } from "@react-three/drei"`);
  builder.inject('scene', '<Environment background preset="city" />');
  builder.inject(
    'readme-libraries',
    `[@react-three/drei](https://drei.docs.pmnd.rs/) - Useful helpers for @react-three/fiber`
  );
}
