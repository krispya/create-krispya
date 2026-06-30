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

**Intent**
Figure out what the user asked for: CLI flags, prompts, saved config, workspace inheritance.

**Resolve**
Turn that into concrete facts: exact package manager version, Node version, package versions, pnpm capabilities, detected workspace state.

**Plan**
Decide what should exist: project files, workspace config, scripts, dependencies, tool configs. This is where feature/tool planners run. This ends with a plan, a single array of jobs.

**Apply**
Execute the plan and create the workspace on disk.

### Updating and Migration

When migrating from one version of a tool to another we want to preserve intent. This means we want to patch instead of rewrite files where possible.
