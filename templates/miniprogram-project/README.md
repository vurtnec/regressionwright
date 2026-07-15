# __PROJECT_NAME__

WeChat Mini Program E2E regression project generated from
`@vurtnec_/regressionwright`.

## Prerequisites

- Node.js `20.19+`, `22.12+`, or `24+`.
- WeChat DevTools installed and signed in.
- DevTools service port enabled under Settings > Security.

## Setup

From this project root:

```bash
pnpm install
pnpm regressionwright registry
```

The generated `config/dev.json` points to the included two-page fixture at
`fixtures/miniapp`. Override either path without editing committed config:

```bash
export WECHAT_DEVTOOLS_CLI=/Applications/wechatwebdevtools.app/Contents/MacOS/cli
export MINIPROGRAM_PROJECT_PATH=/absolute/path/to/your/miniprogram
```

## Run

```bash
pnpm regressionwright run --env dev
```

The starter pipeline launches the fixture Home page, taps `#settings-link`,
and verifies the Settings route and title.

Run artifacts are retained under:

```text
artifacts/runs/{pipeline}/{runId}/
├── plan.json
├── input.json
├── run-context.json
└── miniprogram/
```

## Architecture Boundary

The Harness owns pipeline planning, stage contracts, checks, context,
diagnosis, and resume. Project stages own Mini Program routes, selectors, and
interactions. `miniprogram-automator` and WeChat DevTools own the automation
connection.

Add stages using the same model as other RegressionWright projects:

```text
pipeline -> stage ref -> stage metadata -> input contract -> deterministic Mini Program executor -> checks
```
