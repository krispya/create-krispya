## Workspace Compatibility

When making changes to generators, integrations, or templates, ensure changes work for **both** single projects and monorepo workspaces unless explicitly stated otherwise. If it's unclear how a change should apply to both contexts, ask for clarification before proceeding.

Key differences to consider:
- Single projects: standalone with direct dependencies
- Monorepos: use `workspace:*` references, `.config/` packages, and shared tooling at root
