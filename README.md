# create-krispya

A CLI for scaffolding modern web projects and monorepos with sensible defaults.

## Quick Start

```bash
pnpm create krispya
# or
npm create krispya
# or
yarn create krispya
```

## Features

- **Monorepo support** — Generate pnpm workspaces with shared configs
- **Modern tooling** — Oxlint, Oxfmt, Vite, Vitest out of the box
- **TypeScript first** — Full type safety with JavaScript fallback
- **Library ready** — ESM/CJS dual output with proper exports
- **React & R3F** — First-class support with optional integrations

## Project Types

| Type        | Description                                              |
| ----------- | -------------------------------------------------------- |
| Application | Web app with Vite dev server and bundling                |
| Library     | Publishable npm package with ESM/CJS output              |
| Monorepo    | pnpm workspace with shared configs and multiple packages |

## Templates

| Template     | Description                       |
| ------------ | --------------------------------- |
| `vanilla`    | Vanilla TypeScript (default)      |
| `vanilla-js` | Vanilla JavaScript                |
| `react`      | React with TypeScript             |
| `react-js`   | React with JavaScript             |
| `r3f`        | React Three Fiber with TypeScript |
| `r3f-js`     | React Three Fiber with JavaScript |

## Monorepo

Generate a monorepo with shared configuration packages:

```bash
pnpm create krispya my-workspace --monorepo
```

This creates:

```
my-workspace/
├── .config/
│   ├── typescript/    # @config/typescript - shared tsconfigs
│   ├── oxlint/        # @config/oxlint - shared lint rules
│   └── oxfmt/         # @config/oxfmt - shared format rules
├── apps/              # Application packages
├── packages/          # Library packages
├── package.json
└── pnpm-workspace.yaml
```

### Adding Packages

**Interactive:**

```bash
cd my-workspace
pnpm create krispya
# Select "Add new package to this workspace"
```

**Non-interactive (for scripts/AI):**

```bash
# Add a library to packages/
pnpm create krispya my-lib --workspace --type library --template react

# Add an app to apps/
pnpm create krispya my-app --workspace --template r3f --drei --leva
```

The CLI automatically detects workspace directories from `pnpm-workspace.yaml`. If you have custom directories beyond `apps/` and `packages/` (e.g., `examples/`, `modules/`), you'll be prompted to select where to place the new package (interactive mode only).

Sub-packages automatically:

- Extend shared configs via `@config/*` workspace dependencies
- Skip redundant files (`.gitignore`, `.vscode/`, etc.)
- Use root-level dev tools (oxlint, oxfmt)

### Validating a Workspace

Check if a monorepo is properly configured:

```bash
pnpm create krispya --check
```

Returns exit code `0` if valid, `1` if invalid. Validates:

- `.config/typescript` package exists
- Linter config exists (`.config/oxlint`, `eslint.config.js`, or `biome.json`)
- Formatter config exists (`.config/oxfmt`, `.prettierrc.json`, or `biome.json`)

Useful in scripts:

```bash
if pnpm create krispya --check; then
  pnpm create krispya  # add package
fi
```

### AI Instruction Files

When creating a monorepo, you can generate AI instruction files to help AI assistants understand the workspace:

| File                              | Tool                    |
| --------------------------------- | ----------------------- |
| `.cursor/rules`                   | Cursor                  |
| `AGENTS.md`                       | GitHub Copilot, general |
| `CLAUDE.md`                       | Claude                  |
| `.github/copilot-instructions.md` | GitHub Copilot          |

Select which files to generate during monorepo creation. Your selection can be saved as a default.

## Tooling Options

| Category  | Options                      | Default   |
| --------- | ---------------------------- | --------- |
| Linter    | `oxlint`, `eslint`, `biome`  | `oxlint`  |
| Formatter | `oxfmt`, `prettier`, `biome` | `oxfmt`   |
| Bundler   | `unbuild`, `tsdown`          | `unbuild` |
| Testing   | `vitest`, `none`             | varies\*  |

\*Testing defaults to `vitest` for libraries, `none` for applications (configurable via prompts).

## CLI Options

```
create-krispya [name] [options]

Project Options:
  --type <type>               app | library (default: app)
  --template <type>           vanilla | react | r3f (+ -js variants)
  --linter <type>             eslint | oxlint | biome
  --formatter <type>          prettier | oxfmt | biome
  --bundler <bundler>         unbuild | tsdown (libraries only)
  --package-manager <pm>      npm | yarn | pnpm
  --node-version <version>    Node.js version (default: latest)
  --pnpm-manage-versions      Enable pnpm version management (default: true)

Workspace Options:
  --workspace                 Add package to current monorepo (non-interactive)
  --dir <directory>           Target directory (default: apps/ or packages/)

Utility Options:
  --check                     Validate current monorepo workspace (exit 0/1)
  --fix                       Fix monorepo by generating missing config packages
  --clear-config              Clear saved preferences (editor, window reuse)
  --config-path               Print path to config file
```

### R3F Integrations

For `r3f`/`r3f-js` templates:

```
--drei            @react-three/drei helpers
--handle          @react-three/handle events
--leva            leva controls
--postprocessing  @react-three/postprocessing effects
--rapier          @react-three/rapier physics
--xr              @react-three/xr VR/AR
--uikit           @react-three/uikit UI
--offscreen       @react-three/offscreen rendering
--zustand         zustand state
--koota           koota ECS
--triplex         Triplex dev environment
--viverse         Viverse deployment
```

## Examples

```bash
# Interactive mode
pnpm create krispya

# React app with defaults
pnpm create krispya my-app --template react

# Monorepo workspace (select "Monorepo" in prompts)
pnpm create krispya my-workspace

# Add package to monorepo (non-interactive)
pnpm create krispya my-lib --workspace --type library --template react
pnpm create krispya my-example --workspace --dir examples --template r3f

# R3F with integrations
pnpm create krispya my-3d-app --template r3f --drei --rapier --leva

# Library with tsdown
pnpm create krispya my-lib --type library --template react --bundler tsdown

# Custom tooling
pnpm create krispya my-app --linter eslint --formatter prettier

# Validate monorepo workspace
pnpm create krispya --check

# Clear saved preferences
pnpm create krispya --clear-config
```

## Preferences

The CLI saves preferences for:

- **Editor** — Cursor, VS Code, WebStorm, or skip
- **Window reuse** — Open in current window or new window
- **AI files** — Which AI instruction files to generate for monorepos

Clear saved preferences:

```bash
pnpm create krispya --clear-config
```

View config file location:

```bash
pnpm create krispya --config-path
```

## Post-Creation

After scaffolding:

1. Install dependencies: `pnpm install`
2. Start development: `pnpm dev`
3. Optionally open in your editor (Cursor, VS Code, or WebStorm)
