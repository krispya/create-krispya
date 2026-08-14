import type { PlanOffscreenOptions, PlanBuilder } from '../../types.js';
import chalk from 'chalk';

export function planOffscreen(builder: PlanBuilder, options: PlanOffscreenOptions | undefined) {
  if (options == null) {
    return;
  }
  if (builder.options.xr != null) {
    console.info(
      chalk.blue('Info:'),
      '@react-three/offscreen is disabled because it is not supported with XR'
    );
    return;
  }
  builder.addDependency('@react-three/offscreen');
  builder.inject(
    'readme-libraries',
    `[@react-three/offscreen](https://github.com/pmndrs/offscreen) - Offload your scene to a worker thread for better performance`
  );
}
