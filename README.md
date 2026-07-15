# RegressionWright

Deterministic, stage-based E2E regression pipelines with AI oversight and
code-executed daily runs.

## Runtime Support

RegressionWright supports three deterministic executors while keeping the same
pipeline, stage, schema, context, evidence, diagnosis, and resume model:

| Executor | Target | Runtime |
|---|---|---|
| `playwright` | Web | Built-in Playwright test runner |
| `appium` | Native mobile; iOS starter included | Built-in Appium pipeline runner with project-owned WebdriverIO sessions |
| `miniprogram` | WeChat Mini Program | Built-in project runner with project-owned `miniprogram-automator` sessions |

The Appium scaffold targets iOS through the XCUITest driver. Direct XCUITest
execution without Appium is not supported. The Mini Program scaffold targets
WeChat DevTools automation. Mixed-executor pipelines are not supported.

## Open Source Boundary

This repository contains the generic harness only:

- CLI commands for `run`, `daily`, `resume`, `registry`, and diagnostics;
- generic pipeline, stage, input, evidence, and adapter helpers;
- scaffold templates for new regression projects;
- reusable integrations and AI operating guidance.

Project-specific regression packs are consumers of this package. They should
live in separate repositories and provide their own pipelines, stage metadata,
checks, data templates, page/screen objects, credentials, browser/device
configuration, auth state, and run artifacts.

## Internal Or Company Use

Company projects can use this harness without putting private automation code in
the open-source repository. During local development, point the consuming
project to a local checkout:

```json
"@vurtnec_/regressionwright": "file:/path/to/regressionwright"
```

For controlled internal rollout, consume a git tag, private package mirror, or
local tarball. Keep environment files, credentials, screenshots, traces, and
business data in the consuming project.

## Quick Start Modes

### V1 Harness Source Mode

This is the first supported internal path. Users download only the harness
source project, then scaffold their own regression project next to it.

1. From any parent directory, download the harness source and enter it:

```bash
git clone https://github.com/vurtnec/regressionwright.git
cd regressionwright
```

2. From the harness source root, install dependencies:

```bash
pnpm install
```

3. From the harness source root, scaffold a regression project:

```bash
pnpm run create ../my-project-regression-test \
  --module my-project \
  --core-package "file:$PWD" \
  --integration codex
```

Add `--reporter stagewright` to install and configure the optional StageWright
Playwright reporter in the generated project.

For an iOS Appium project, use:

```bash
pnpm run create ../my-ios-regression-test \
  --module my-ios-app \
  --executor appium \
  --core-package "file:$PWD" \
  --integration codex
```

For a WeChat Mini Program project, use:

```bash
pnpm run create ../my-miniprogram-regression-test \
  --module my-miniprogram \
  --executor miniprogram \
  --core-package "file:$PWD" \
  --integration codex
```

The target directory should be outside any existing pnpm workspace. If you are
testing from this maintainer monorepo at `packages/core`, use a target outside
the current workspace, for example:

```bash
pnpm run create ../../../my-project-regression-test \
  --module my-project \
  --core-package "file:$PWD" \
  --integration codex
```

4. From the generated project root, install and run:

```bash
cd ../my-project-regression-test
pnpm install
pnpm exec playwright install chromium
pnpm regressionwright registry
pnpm regressionwright run --env dev --site default --headed
```

If you used a different scaffold target, `cd` to that target instead.

The generated project owns project-level regression code and references the
core package with:

```json
"@vurtnec_/regressionwright": "file:/path/to/regressionwright"
```

### Local Release Demo

Use this when you want to simulate a release without publishing to npm.

1. From the harness source root, pack the harness:

```bash
pnpm pack
```

2. From the harness source root, scaffold a project from the tarball:

```bash
pkg="$PWD/vurtnec_-regressionwright-0.1.0.tgz"
pnpm dlx --package "$pkg" create-regressionwright ../demo-regression-test \
  --module demo \
  --core-package "file:$pkg" \
  --integration codex
```

3. From the generated project root, install and run:

```bash
cd ../demo-regression-test
pnpm install
pnpm exec playwright install chromium
pnpm regressionwright registry
pnpm regressionwright run --env dev --site default --headed
```

The generated project references the local tarball through `file:`.

### Public Npm Mode

Scaffold from the CLI bundled with `@vurtnec_/regressionwright`:

```bash
pnpm dlx --package @vurtnec_/regressionwright create-regressionwright my-project-regression-test \
  --module my-project \
  --integration codex
cd my-project-regression-test
pnpm install
pnpm exec playwright install chromium
pnpm regressionwright registry
pnpm regressionwright run --headed
```

Project-specific module packs do not live in this package. They depend on this package and provide their own `config`, `pipelines`, `stages`, `contracts`, `checks`, `data-templates`, module adapter, and deterministic executor code.

## Package Contents

- `regressionwright`: CLI for `run`, `daily`, `resume`, `registry`, `diagnose`, `integration`, `auth`, and `profile`.
- `create-regressionwright`: standalone project scaffold.
- `src/core/`: generic pipeline, stage, input, evidence, and project adapter helpers.
- `src/integrations/`: optional reusable provider integrations.
- `tests/harness/`: generic Playwright runner used by consuming projects.
- `scripts/appium-runner.mjs`: generic Appium stage loop used by mobile projects.
- `scripts/miniprogram-runner.mjs`: generic Mini Program stage loop.
- `scripts/project-pipeline-runner.mjs`: shared project-owned pipeline runner contract.
- `templates/project/`: Playwright starter project covering the core data model.
- `templates/appium-project/`: iOS Appium/XCUITest starter project.
- `templates/miniprogram-project/`: WeChat DevTools starter with a runnable two-page fixture.
- `skills/regressionwright/`: AI operating runbook.

## Public API

Use the `regressionwright` and `create-regressionwright` commands for CLI flows.
Code-level consumers must import an explicit path listed in `package.json`
`exports`, such as `@vurtnec_/regressionwright/run-data.mjs`. Direct imports
from unexported package `src/`, `scripts/`, or `tests/` internals are not
supported.

## Mental Model

```text
AI / human operator
  -> harness CLI
  -> pipeline plan
  -> selected deterministic executor
  -> deterministic stage code
  -> run context + evidence + diagnosis
```

Daily runs treat stage execution as a black box. AI can inspect input, output, evidence, structured errors, and diagnosis summaries, but it should not operate the browser or device inside a stage.

Initialization is different: AI can author or repair stage code, run it, inspect failures, and iterate until the stage or pipeline is stable enough for daily use.

Resume runs continue from a previous run artifact. The CLI finds the failed or first pending stage, walks back to the nearest pipeline `resumeBoundary`, then starts a new run from that boundary with the old input and context.

## Appium iOS Runtime

Generate an Appium project with `--executor appium`, then install its pinned
XCUITest driver and configure the device/app capabilities:

```bash
pnpm install
pnpm appium:driver:install
# Edit config/dev.json.
pnpm appium:server
```

In another terminal:

```bash
pnpm regressionwright registry
pnpm regressionwright run --env dev
```

Stage metadata declares `executor.type: "appium"`. The CLI dispatches to the
built-in Appium runner, while the project `pipelineRunnerModule` owns the
WebdriverIO session, selectors, gestures, and screenshots. Appium evidence is
run-scoped under:

```text
artifacts/runs/{pipeline}/{runId}/appium/
```

Appium server and XCUITest driver lifecycle remain explicit prerequisites. Core
does not silently install drivers, boot devices, or alter signing settings.

## WeChat Mini Program Runtime

Generate a project with `--executor miniprogram`. Install and sign in to WeChat
DevTools, then enable its service port under Settings > Security. The generated
project includes a two-page fixture and defaults to the standard macOS CLI path:

```bash
pnpm install
pnpm regressionwright registry
pnpm regressionwright run --env dev
```

Override the DevTools or project path through `config/dev.json` or:

```bash
export WECHAT_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli
export MINIPROGRAM_PROJECT_PATH=/absolute/path/to/miniprogram
```

Stage metadata declares `executor.type: "miniprogram"`. Project stage code owns
routes, selectors, interactions, and screenshots. Evidence is retained under:

```text
artifacts/runs/{pipeline}/{runId}/miniprogram/
```

## Dynamic Data

Every run starts with a data node that writes `input.json`. Pipelines compose
stage refs; they should not fork just to change environment data.

For environment or site differences, a project can set `dataProfile` in
`config/{env}.json`. Stage-data files can define `profiles.<dataProfile>`
overrides. The module data generator merges:

```text
base stage data + profiles[env.dataProfile] + input params
```

The `profiles` authoring helper is not copied into final `input.json`.

## Runtime Performance

Projects can use `@vurtnec_/regressionwright/performance-monitor.mjs` to record
runtime measurements during Playwright stages. The monitor is explicit: stage
code marks `initial-render` and `action` windows around the business waits that
define "ready".

The monitor writes:

```text
artifacts/runs/{pipeline}/{runId}/performance.json
artifacts/runs/{pipeline}/{runId}/performance-summary.md
```

The CLI also points Playwright output at the same run artifact directory so HTML
reports, traces, screenshots, and videos are not overwritten by the next run:

```text
artifacts/runs/{pipeline}/{runId}/playwright-report/
artifacts/runs/{pipeline}/{runId}/playwright/
```

Each entry includes duration, URL/title before and after, backend API counts,
failed backend APIs, console errors, page errors, long tasks, and navigation
timing when available. The JSON and markdown reports also include backend API
P90/P95 by method and path.

## Optional StageWright Reporter

StageWright is an optional project-level Playwright reporter. It is not a Core
dependency and does not participate in pipeline execution, stage checks, or
pass/fail decisions.

Enable it while scaffolding:

```bash
pnpm run create ../my-project-regression-test \
  --module my-project \
  --core-package "file:$PWD" \
  --reporter stagewright \
  --integration codex
```

The scaffold adds `playwright-smart-reporter` only to the generated project's
`devDependencies`. Standard Playwright HTML output remains enabled, and the
additional report and cross-run history are written to:

```text
artifacts/runs/{pipeline}/{runId}/playwright-report/stagewright-report.html
artifacts/stagewright-history/
```

The generated configuration disables StageWright cloud upload and managed AI
features. Harness `summary.json`, stage contracts, and selected check sets
remain the authoritative regression result.

## Local Package Development

From the harness source root:

```bash
pnpm install
pnpm verify
```

`verify` runs the TypeScript check, focused core/integration tests, and a dry-run
package audit. The audit confirms required public files and export targets are
included while local credentials and generated artifacts are excluded.

To create the local release tarball after verification:

```bash
pnpm pack
```

## Project AI Skills

Install the package-owned runbook into the consuming regression project, not the
user profile:

```bash
pnpm regressionwright --integration codex
pnpm regressionwright integration install claude
pnpm regressionwright integration install all
```

Targets:

```text
.agents/skills/regressionwright/
.claude/skills/regressionwright/
```

## Documentation

- [Framework boundary](docs/framework.md)
- [Architecture notes](docs/regressionwright-architecture.md)
- [Flow notes](docs/regressionwright-flows.md)
- [Packaging boundary](docs/regressionwright-packaging.md)
- [AI skill](skills/regressionwright/SKILL.md)
