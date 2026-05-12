import chalk from 'chalk';
import type { PlanPostprocessingOptions, PlanBuilder } from '../types.js';

export function planPostprocessing(
  builder: PlanBuilder,
  options: PlanPostprocessingOptions | undefined
) {
  if (options == null) {
    return;
  }
  if (builder.options.xr != null) {
    console.info(
      chalk.blue('Info:'),
      '@react-three/postprocessing is disabled because it is not supported with XR'
    );
    return;
  }
  builder.addDependency('@react-three/postprocessing');
  builder.inject(
    'readme-libraries',
    `[@react-three/postprocessing](https://react-postprocessing.docs.pmnd.rs/) - Post-processing effects for @react-three/fiber`
  );
}
