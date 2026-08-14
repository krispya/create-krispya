import type { PlanZustandOptions, PlanBuilder } from '../../types.js';

export function planZustand(builder: PlanBuilder, options: PlanZustandOptions | undefined) {
  if (options == null) {
    return;
  }
  builder.addDependency('zustand');
  builder.inject(
    'readme-libraries',
    `[zustand](https://zustand.docs.pmnd.rs/) - small, fast and scalable state-management solution`
  );
}
