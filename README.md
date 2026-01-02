# create-krispya

A CLI tool for scaffolding modern web projects with sensible defaults.

## Usage

```bash
npm create krispya
```

Or specify a project name:

```bash
npm create krispya my-app
```

## Features

- **Application & Library Mode**: Scaffold applications or publishable libraries
- **Multiple Templates**: Choose from Vanilla, React, or React Three Fiber (each with TypeScript or JavaScript variants)
- **Package Manager Support**: Works with npm, yarn, or pnpm
- **Node Version Management**: Built-in support for specifying Node.js versions
- **Interactive Setup**: Guided prompts to configure your project

## Project Types

### Application (default)

Creates a ready-to-run web application with Vite for development and bundling.

### Library

Creates a publishable npm package with:

- Proper `package.json` exports (`main`, `module`, `types`, `exports`)
- Bundling via [unbuild](https://github.com/unjs/unbuild) (default) or [tsdown](https://github.com/nicepkg/tsdown)
- Peer dependencies for React/Three.js (when applicable)
- ESM and CJS output formats

## Templates

| Template     | Description                       |
| ------------ | --------------------------------- |
| `vanilla`    | Vanilla TypeScript (default)      |
| `vanilla-js` | Vanilla JavaScript                |
| `react`      | React with TypeScript             |
| `react-js`   | React with JavaScript             |
| `r3f`        | React Three Fiber with TypeScript |
| `r3f-js`     | React Three Fiber with JavaScript |

## Options

### Basic Options

| Option                        | Description                                       |
| ----------------------------- | ------------------------------------------------- |
| `[name]`                      | Project name (prompted if not provided)           |
| `--type <type>`               | Project type: `app` or `library` (default: app)   |
| `--template <type>`           | Template (see above, default: vanilla)            |
| `--package-manager <manager>` | Specify package manager (npm, yarn, or pnpm)      |
| `-y, --yes`                   | Use default values without prompts                |

### Library Options

| Option              | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `--bundler <type>`  | Library bundler: `unbuild` or `tsdown` (default: unbuild) |

### Advanced Options

| Option                      | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| `--node-version <version>`  | Set Node.js version (default: "latest")                     |
| `--pnpm-manage-versions`    | Enable pnpm manage-package-manager-versions (default: true) |
| `--no-pnpm-manage-versions` | Disable pnpm manage-package-manager-versions                |

### React Three Fiber Integration Options

These options are only available when using the `r3f` or `r3f-js` templates:

| Option             | Description                                        |
| ------------------ | -------------------------------------------------- |
| `--drei`           | Add @react-three/drei for helpers and abstractions |
| `--handle`         | Add @react-three/handle for event handling         |
| `--leva`           | Add leva for controls and panels                   |
| `--postprocessing` | Add @react-three/postprocessing for effects        |
| `--rapier`         | Add @react-three/rapier for physics                |
| `--xr`             | Add @react-three/xr for VR/AR support              |
| `--uikit`          | Add @react-three/uikit for UI components           |
| `--offscreen`      | Add @react-three/offscreen for offscreen rendering |
| `--zustand`        | Add zustand for state management                   |
| `--koota`          | Add koota for animation                            |
| `--triplex`        | Set up Triplex development environment             |
| `--viverse`        | Set up viverse deployment                          |

## Examples

Create a new project interactively:

```bash
npm create krispya
```

Create a React project with JavaScript:

```bash
npm create krispya my-app --template react-js
```

Create a React Three Fiber project with integrations:

```bash
npm create krispya my-3d-app --template r3f --drei --leva --rapier
```

Create a project using pnpm with specific Node version:

```bash
npm create krispya my-app --package-manager pnpm --node-version 22
```

Skip prompts and use defaults:

```bash
npm create krispya my-app --yes
```

Create a library:

```bash
npm create krispya my-lib --type library
```

Create a React component library with tsdown:

```bash
npm create krispya my-components --type library --template react --bundler tsdown
```
