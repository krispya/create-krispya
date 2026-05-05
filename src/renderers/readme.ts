import type { BaseTemplate, CodeInjectionLocation, VirtualFile, LibraryBundler } from '../types.js';

export type ReadmeParams = {
    name: string;
    baseTemplate: BaseTemplate;
    isLibrary: boolean;
    libraryBundler: LibraryBundler;
    packageManager: string;
    codeSnippets: Partial<Record<CodeInjectionLocation, string[]>>;
};

/**
 * Generates the README.md file for the project.
 */
export function renderReadme(params: ReadmeParams): VirtualFile {
    const { name, baseTemplate, isLibrary, libraryBundler, packageManager, codeSnippets } = params;

    const isVanilla = baseTemplate === 'vanilla';
    const isReact = baseTemplate === 'react';
    const isR3f = baseTemplate === 'r3f';
    const ext = 'ts';
    const jsxExt = 'tsx';

    // Ensure arrays exist
    codeSnippets['readme-libraries'] ??= [];
    codeSnippets['readme-commands'] ??= [];

    // Add library descriptions based on template
    if (isLibrary) {
        // Libraries don't mention vite, they mention their bundler
    } else if (isVanilla) {
        codeSnippets['readme-libraries'].unshift(
            `[Vite](https://vitejs.dev/) - Next generation frontend tooling`
        );
    } else if (isReact) {
        codeSnippets['readme-libraries'].unshift(
            `[React](https://react.dev/) - A JavaScript library for building user interfaces`,
            `[Vite](https://vitejs.dev/) - Next generation frontend tooling`
        );
    } else {
        codeSnippets['readme-libraries'].unshift(
            `[React](https://react.dev/) - A JavaScript library for building user interfaces`,
            `[Three.js](https://threejs.org/) - JavaScript 3D library`,
            `[@react-three/fiber](https://docs.pmnd.rs/react-three-fiber) - lets you create Three.js scenes using React components`
        );
    }

    if (isLibrary) {
        codeSnippets['readme-commands'].unshift(
            `\`${packageManager} install\` to install the dependencies`,
            `\`${packageManager} run build\` to build the library into the \`dist\` folder`,
            `\`${packageManager} run test\` to run the tests`,
            `\`${packageManager} run release\` to build and publish to npm`
        );
    } else {
        codeSnippets['readme-commands'].unshift(
            `\`${packageManager} install\` to install the dependencies`,
            `\`${packageManager} run dev\` to run the development server and preview the app with live updates`,
            `\`${packageManager} run build\` to build the app into the \`dist\` folder`,
            `\`${packageManager} run test\` to run the tests`
        );
    }

    // Generate template-specific architecture description
    let architectureDesc: string[];
    if (isLibrary) {
        architectureDesc = [
            `- \`src/index.${isReact || isR3f ? jsxExt : ext}\` is the main entry point for your library exports`,
            `- Add your library code in the \`src\` folder`,
            `- \`tests/\` contains your test files`,
        ];
    } else if (isVanilla) {
        architectureDesc = [
            `- \`src/main.${ext}\` is the entry point for your application`,
            `- \`tests/\` contains your test files`,
            `- Static assets can be placed in the \`public\` folder`,
        ];
    } else if (isReact) {
        architectureDesc = [
            `- \`src/app.${jsxExt}\` defines the main application component`,
            `- \`src/index.${jsxExt}\` renders the React app into the DOM`,
            `- \`tests/\` contains your test files`,
            `- Static assets can be placed in the \`public\` folder`,
        ];
    } else {
        architectureDesc = [
            `- \`app.${jsxExt}\` defines the main application component containing your 3D content`,
            `- Modify the content inside the \`<Canvas>\` component to change what is visible on screen`,
            `- \`tests/\` contains your test files`,
            `- Static assets can be placed in the \`public\` folder`,
        ];
    }

    const bundlerDescription = isLibrary
        ? libraryBundler === 'unbuild'
            ? `This library uses [unbuild](https://github.com/unjs/unbuild) for building.`
            : `This library uses [tsdown](https://github.com/nicepkg/tsdown) for building.`
        : `This project uses [Vite](https://vitejs.dev/) as the bundler for fast development and optimized production builds.`;

    const content = [
        `# ${name}`,
        `This ${isLibrary ? 'library' : 'project'} was generated with create-krispya`,
        ...(codeSnippets['readme-start'] ?? []),
        '\n',
        `## Project Architecture`,
        bundlerDescription,
        ...architectureDesc,
        '\n',
        `## Libraries`,
        `The following libraries are used - checkout the linked docs to learn more`,
        ...(codeSnippets['readme-libraries'] ?? []).map((library) => `- ${library}`),
        '\n',
        codeSnippets['readme-tools'] && `## Tools`,
        ...(codeSnippets['readme-tools'] ?? []).map((tool) => `- ${tool}`),
        codeSnippets['readme-tools'] && `\n`,
        `## Development Commands`,
        ...(codeSnippets['readme-commands'] ?? []).map((command) => `- ${command}`),
        ...(codeSnippets['readme-end'] ?? []),
    ]
        .filter(Boolean)
        .join('\n');

    return { type: 'text', content };
}
