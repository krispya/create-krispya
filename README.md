# create-krispya

> [!WARNING]
> I maintain the standalone library and application templates with vanilla. React, R3F and monorepo is currently experimental.

> Full AI generated docs can be found [here](./docs/api.md).

A CLI for scaffolding modern, clutter-free web projects.

## Quick Start

```bash
pnpm create krispya
# or
bun create krispya
# or
npm create krispya@latest
# and follow the prompts
```

**Who cares?**

I really hate looking at my repo when there are 20 config files sitting in root. It is noisy and, worst of all, simply ugly. Not only do we derserve beautiful code, but in the post-AI world great taste is all we have. In pursuit of minimalism, as many files as possible are moved to hidden directories such as `.config` and`.vscode`.

We are also in a time of rampant changes to the JS toolchain ecosytem. In an effort to keep up, but also encourage trying new tools out, I wanted to build a framework that let me swap between them with some guardrails.

## Single-project workspaces

The basic dish.

## CLI

```bash
npm create krispya name
npm create krispya --update
```

## Options

### Editor config

Editors, or IDEs, allow the user to generically configure formatting using the [EditorConfig](https://spec.editorconfig.org/) file. You might think, isn't this what the formatter is for? The formatter only runs after code is written while the editor config will enforce the rules inside the editor itself making generated code more consistent.

Editor specific config files can optionally be installed for more control. Currently only `vscode` is supported.
