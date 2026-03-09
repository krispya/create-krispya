import chalk from 'chalk';
import type { GeneratePostprocessingOptions, Generator } from '../types.js';

export function generatePostprocessing(
    generator: Generator,
    options: GeneratePostprocessingOptions | undefined
) {
    if (options == null) {
        return;
    }
    if (generator.options.xr != null) {
        console.info(
            chalk.blue('Info:'),
            '@react-three/postprocessing is disabled because it is not supported with XR'
        );
        return;
    }
    generator.addDependency('@react-three/postprocessing');
    generator.inject(
        'readme-libraries',
        `[@react-three/postprocessing](https://react-postprocessing.docs.pmnd.rs/) - Post-processing effects for @react-three/fiber`
    );
}
