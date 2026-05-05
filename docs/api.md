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
- **Config strategy** — Choose between stealth (`.config/`) or root placement

## Project Types

| Type        | Description                                              |
| ----------- | -------------------------------------------------------- |
| Application | Web app with Vite dev server and bundling                |
| Library     | Publishable npm package with ESM/CJS output              |
| Monorepo    | pnpm workspace with shared configs and multiple packages |

> **Note:** Monorepos require pnpm. Applications and libraries support pnpm, npm, and yarn.

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
pnpm create krispya
# Select "Monorepo" when prompted for project type
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

### Updating a Workspace

Update an existing monorepo to the latest template:

```bash
pnpm create krispya --update
```

This compares your workspace against the latest template and offers to:

- Add new files (AI instructions, VS Code settings, etc.)
- Update config packages to latest versions
- Merge workspace config changes

Files are grouped by category. For each category with changes:

- `+` indicates new files (safe to add)
- `~` indicates changed files (will overwrite your customizations)

Use `--yes` for non-interactive mode (adds new files only, skips modified).

### Migrating Linter/Formatter

Switch between linters or formatters:

```bash
# Migrate linter
pnpm create krispya --update --linter eslint

# Migrate formatter
pnpm create krispya --update --formatter prettier

# Migrate both
pnpm create krispya --update --linter biome --formatter biome
```

Migration automatically:

- Removes old config packages (e.g., `.config/oxlint/`)
- Generates new config packages (e.g., `.config/eslint/`)
- Updates root `package.json` (devDependencies, scripts)
- Updates all sub-package devDependencies
- Regenerates VS Code settings and AI files

Run `pnpm install` after migration to update dependencies.

### AI Rules

Optionally generate AI instruction files to help coding assistants understand the project:

| File        | Supported by                      |
| ----------- | --------------------------------- |
| `AGENTS.md` | OpenAI, Cursor, Windsurf, Copilot |
| `CLAUDE.md` | Claude Code                       |

These are pointer files that reference `.ai/workspace.md`, which contains:

- Project type and tooling (linter, formatter, package manager)
- Common commands (`pnpm test`, `pnpm build`, etc.)
- Project structure documentation

Select which files to generate during project creation. Your selection can be saved as a default.

## Tooling Options

| Category  | Options                      | Default   |
| --------- | ---------------------------- | --------- |
| Linter    | `oxlint`, `eslint`, `biome`  | `oxlint`  |
| Formatter | `oxfmt`, `prettier`, `biome` | `oxfmt`   |
| Bundler   | `unbuild`, `tsdown`          | `unbuild` |
| Testing   | `vitest`, `none`             | varies\*  |

\*Testing defaults to `vitest` for libraries, `none` for applications (configurable via prompts).

## Config Strategy

Control where configuration files are placed in single-package workspaces:

| Strategy  | Description                                    |
| --------- | ---------------------------------------------- |
| `stealth` | Configs in `.config/` directory (default)      |
| `root`    | Configs at project root (traditional approach) |

**Stealth mode** keeps your project root clean:

```
my-project/
├── .config/
│   ├── oxlint.json
│   ├── prettier.json
│   ├── tsconfig.app.json
│   └── tsconfig.node.json
├── src/
├── package.json
└── tsconfig.json
```

**Root mode** uses traditional config placement:

```
my-project/
├── src/
├── oxlint.json
├── .prettierrc
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── package.json
```

Set your default via the global config file (`~/.config/create-krispya/config.json`):

```json
{
  "configStrategy": "root"
}
```

## CLI Options

```
create-krispya [name] [options]

Project Options:
  --type <type>               app | library (default: app)
  --template <type>           vanilla | react | r3f (+ -js variants)
  --linter <type>             eslint | oxlint | biome
  --formatter <type>          prettier | oxfmt | biome
  --bundler <bundler>         unbuild | tsdown (libraries only)
  --package-manager <pm>      npm | yarn | pnpm (monorepos: pnpm only)
  --node-version <version>    Node.js version (default: latest)
  --pnpm-manage-versions      Enable pnpm version management (default: true)

Workspace Options:
  --workspace                 Add package to current monorepo (non-interactive)
  --dir <directory>           Target directory (default: apps/ or packages/)

Utility Options:
  --path <directory>          Run in specified directory instead of cwd
  --check                     Validate current monorepo workspace (exit 0/1)
  --fix                       Fix monorepo by generating missing config packages
                              (use with --linter and --formatter for non-interactive)
  --update                    Update monorepo to latest template (add new files, update configs)
  --yes                       Accept defaults for prompts (non-interactive mode)
  --clear-config              Clear saved preferences
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

# Validate a different directory
pnpm create krispya --check --path ~/Dev/my-monorepo

# Fix monorepo (interactive)
pnpm create krispya --fix

# Fix monorepo (non-interactive)
pnpm create krispya --fix --linter oxlint --formatter oxfmt

# Update monorepo to latest template
pnpm create krispya --update

# Update monorepo (non-interactive - adds new files only)
pnpm create krispya --update --yes

# Clear saved preferences
pnpm create krispya --clear-config
```

## Preferences

The CLI saves preferences for:

- **AI platforms** — Which AI rule files to generate (AGENTS.md, CLAUDE.md)

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
3. Open the project in your editor if you want
