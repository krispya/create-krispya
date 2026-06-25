import type { PlanRapierOptions, PlanBuilder } from '../types.js';

export function planRapier(builder: PlanBuilder, options: PlanRapierOptions | undefined) {
  if (options == null) {
    return;
  }
  builder.addDependency('@react-three/rapier');
  builder.inject(
    'readme-libraries',
    `[@react-three/rapier](https://github.com/pmndrs/react-three-rapier) - Physics based on Rapier for your @react-three/fiber scene`
  );
}
