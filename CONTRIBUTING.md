# Contributing

Thanks for improving RegressionWright.

## Project Boundary

This repository contains only the generic harness:

- CLI commands;
- pipeline and stage runtime helpers;
- scaffold templates;
- reusable integrations;
- AI operating skill documentation.

Do not add project-specific workflows, selectors, accounts, vendors, customer
data, environment URLs, screenshots, browser profiles, auth state, or generated
run artifacts. Those belong in consuming regression projects.

## Development

Use pnpm:

```bash
pnpm install
pnpm verify
```

When changing scaffold behavior, verify a generated project can install and run:

```bash
pnpm run create ../demo-regression-test \
  --module demo \
  --core-package "file:$PWD" \
  --reporter stagewright \
  --integration codex
cd ../demo-regression-test
pnpm install
pnpm regressionwright registry
```

## Pull Requests

Before opening a pull request:

- keep changes generic and project-agnostic;
- update docs when CLI behavior or data model behavior changes;
- add or update focused tests for runtime behavior;
- run `pnpm verify`;
- confirm no secrets, company names, project names, emails, local paths, or
  generated artifacts were committed.

## Commit Scope

Prefer small changes with clear boundaries. Separate framework changes from
example project changes and documentation-only changes.
