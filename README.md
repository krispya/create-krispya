# create-krispya

A CLI for scaffolding modern web projects with sensible defaults.

## Usage

```bash
npm create krispya
# or
pnpm create krispya
# or
yarn create krispya
```

## Templates

| Template     | Description                       |
| ------------ | --------------------------------- |
| `vanilla`    | Vanilla TypeScript (default)      |
| `vanilla-js` | Vanilla JavaScript                |
| `react`      | React with TypeScript             |
| `react-js`   | React with JavaScript             |
| `r3f`        | React Three Fiber with TypeScript |
| `r3f-js`     | React Three Fiber with JavaScript |

## Project Types

- **Application** (default): Web app with Vite for dev/bundling
- **Library**: Publishable npm package with ESM/CJS output, proper exports, and peer dependencies

## Tooling Options

| Category  | Options                              | Default   |
| --------- | ------------------------------------ | --------- |
| Linter    | `oxlint`, `eslint`, `biome`          | `oxlint`  |
| Formatter | `oxfmt`, `prettier`, `biome`         | `oxfmt`   |
| Bundler   | `unbuild`, `tsdown` (libraries only) | `unbuild` |
| Testing   | `vitest`                             | always    |

## CLI Options

```
create-krispya [name] [options]

Options:
  --type <type>               app | library (default: app)
  --template <type>           vanilla | react | r3f (+ -js variants)
  --linter <type>             eslint | oxlint | biome
  --formatter <type>          prettier | oxfmt | biome
  --bundler <bundler>         unbuild | tsdown (libraries only)
  --package-manager <pm>      npm | yarn | pnpm
  --node-version <version>    Node.js version (default: latest)
  --pnpm-manage-versions      Enable pnpm version management (default: true)
  -y, --yes                   Skip prompts, use defaults
```

### R3F Integrations

For `r3f`/`r3f-js` templates:

```
--drei          @react-three/drei helpers
--handle        @react-three/handle events
--leva          leva controls
--postprocessing  @react-three/postprocessing effects
--rapier        @react-three/rapier physics
--xr            @react-three/xr VR/AR
--uikit         @react-three/uikit UI
--offscreen     @react-three/offscreen rendering
--zustand       zustand state
--koota         koota ECS
--triplex       Triplex dev environment
--viverse       Viverse deployment
```

## Examples

```bash
# Interactive mode
npm create krispya

# React app with defaults
npm create krispya my-app --template react -y

# R3F with integrations
npm create krispya my-3d-app --template r3f --drei --rapier --leva

# Library with tsdown
npm create krispya my-lib --type library --template react --bundler tsdown

# Custom tooling
npm create krispya my-app --linter eslint --formatter prettier
```

## Post-Creation

After scaffolding, you'll be prompted to open the project in your editor (Cursor, VS Code, or WebStorm).
