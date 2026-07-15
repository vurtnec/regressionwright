# __PROJECT_NAME__

iOS E2E regression project generated from `@vurtnec_/regressionwright` with the
Appium executor.

## Prerequisites

- macOS with a compatible Xcode installation.
- Node.js `20.19+`, `22.12+`, or `24+`.
- An iOS simulator or configured real device.
- A built `.app` path or an installed app bundle id.

## Setup

From this project root:

```bash
pnpm install
pnpm appium:driver:install
pnpm appium:driver:list
```

Edit `config/dev.json` and replace the placeholder device, platform version,
and app path. For an already installed app, replace `appium:app` with
`appium:bundleId`. Add `appium:udid` for a specific simulator or real device.

Optionally set `readyAccessibilityId` in:

```text
data-templates/__MODULE_ID__/stage-data/app-session/default.json
```

## Run

Start Appium in one terminal:

```bash
pnpm appium:server
```

Run the deterministic pipeline in another terminal:

```bash
pnpm regressionwright registry
pnpm regressionwright run --env dev
```

Run artifacts are retained under:

```text
artifacts/runs/{pipeline}/{runId}/
├── plan.json
├── input.json
├── run-context.json
└── appium/
```

## Architecture Boundary

The Harness owns pipeline planning, stage contracts, checks, context,
diagnosis, and resume. The project runner owns WebDriverIO/Appium session
creation, mobile selectors, gestures, and screenshots. Appium server and
XCUITest driver lifecycle remain explicit project prerequisites.

Add mobile stages using the same model as web projects:

```text
pipeline -> stage ref -> stage metadata -> input contract -> deterministic Appium executor -> checks
```
