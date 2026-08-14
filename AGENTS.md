<!-- managed:start -->

## Workspace Tools

- **Package Manager:** pnpm
- **Linter:** oxlint
- **Formatter:** prettier

### After Editing

✅ After editing files, check the types for errors and then format and lint only the files changed for the current task.

```sh
# Example
pnpm typecheck
# Run format and lint for only files modified
pnpm exec prettier --config .config/prettier.json --ignore-path .config/prettierignore --write src/App.tsx src/core/systems/move-entity.ts
pnpm lint -- src/App.tsx src/core/systems/move-entity.ts
```

❌ Avoid unless explicitly approved:

```sh
pnpm format
pnpm lint
```

<!-- managed:end -->

## Architecture

The create app allows for building a workspace from a recipe and update it over time.

### Workflow

```
intent -> resolve -> plan -> apply
```

Each stage is a top-level directory in `src/`. Data flows one way, and facts move between stages as function arguments. It is forbidden to import a downstream stage.

**`intent/`** — what the user asked for: intent types, defaults, spec parsing, and the catalog of choosable tools (names, packages, prompts, constraints). Pure.

**`resolve/`** — turns intent into concrete facts: registry versions, package manager and Node versions, saved config, detected workspace state. The only place that reads (network, disk).

**`plan/`** — decides what should exist: files, scripts, dependencies, tool configs. Tool/feature planners and renderers run here. Pure, sync, deterministic — a resolved input always produces the same plan.

**`apply/`** — executes a plan. The only place that writes to disk.

**`cli/`** — flags, prompts, and pipeline composition. May import every stage.

### Updating and Migration

When migrating from one version of a tool to another we want to preserve intent. This means we want to patch instead of rewrite files where possible.
