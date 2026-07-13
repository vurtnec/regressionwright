# RegressionWright Framework

This document describes the generic harness boundary. Project-specific examples belong in module pack docs.

## Mental Model

```text
AI / human operator
  -> harness CLI
  -> pipeline plan
  -> deterministic stage code
  -> run context + evidence + diagnosis
```

Daily runs treat stage execution as a black box. AI may read inputs, outputs, evidence, and errors, then diagnose whether the failure is likely a script issue, environment issue, or product bug.

Initialization is different: AI may create or modify stage code, run it, inspect failures, and iterate until the stage or pipeline is stable enough for daily use.

## Executor Status

The current release supports Playwright web execution only. The CLI launches a
Playwright spec, and the included runner, browser profile, evidence, and
performance helpers are Playwright-specific.

The architecture reserves future executor boundaries without shipping them:

| Executor | Status |
|---|---|
| Playwright | Supported in `@regressionwright/core` |
| Appium | Reserved; no package or runtime implementation |
| XCUITest | Reserved; no package or runtime implementation |

An executor is not supported until it can run a complete generated project and
produce the same plan, input, context, summary, and structured evidence
artifacts. Mixed-executor pipelines are not currently supported.

## Generic Layer

The generic layer should not contain project business vocabulary.

- `src/core/`: run data, run context, stage errors, project adapter loading, evidence helpers, and browser profile helpers.
- `src/integrations/`: optional provider integrations that are reusable but not part of the core runner.
- `bin/regressionwright.mjs`: package-shaped CLI entry.
- `bin/create-regressionwright.mjs`: standalone project scaffold entry.
- `scripts/harness.mjs`: CLI implementation for `run`, `daily`, `resume`, `registry`, and `diagnose`.
- `scripts/refresh-auth.mjs`: generic auth-state refresh wrapper.
- `scripts/open-browser-profile.mjs`: generic persistent browser profile wrapper.
- `tests/harness/pipeline-runner.spec.mjs`: generic Playwright runner that loads the module runner from the adapter.
- `skills/regressionwright/`: AI runbook for operating the harness.
- `templates/project/`: standalone project scaffold.
- `templates/module-pack/`: module-pack extension notes.

These are the generic package files for `@regressionwright/core`.

## Project Root Boundary

The core separates two roots:

- `harnessPackageRoot`: where the generic harness package code lives.
- `consumerProjectRoot`: where project files live, including `config`, `pipelines`, `stage-registry`, `stages`, `contracts`, `checks`, `data-templates`, `src/modules`, `tests`, `.env*`, `.auth`, and `artifacts`.

When no root is explicitly configured, the harness walks upward from the current directory until it finds `config/harness.json`. For package-style execution, a caller can force the project root with:

```bash
E2E_REGRESSION_PROJECT_ROOT=/path/to/my-regression-project pnpm regressionwright run <pipeline-id>
```

## Generic Environment Variables

Generic environment variables use the `E2E_REGRESSION_*` prefix. Project-specific or legacy aliases may exist in a module pack, but they are not part of the framework API.

Common generic variables:

```text
E2E_REGRESSION_PROJECT_ROOT
E2E_REGRESSION_MODULE
E2E_REGRESSION_ENV
E2E_REGRESSION_PIPELINE
E2E_REGRESSION_DATA_VARIANT
E2E_REGRESSION_INPUT_PARAMS
E2E_REGRESSION_HEADLESS
E2E_REGRESSION_BROWSER_CHANNEL
E2E_REGRESSION_RESUME_CONTEXT_PATH
E2E_REGRESSION_RESUME_SOURCE_RUN_DIR
E2E_REGRESSION_RESUME_START_STAGE
```

Common mail integration variables:

```text
E2E_REGRESSION_EMAIL_TIMEOUT_MS
E2E_REGRESSION_EMAIL_POLL_MS
E2E_REGRESSION_EMAIL_LOOKBACK_MINUTES
```

## Dynamic Data

Every run starts with a data node that creates `input.json`.

Pipeline JSON only composes stages. It should not point to a separate pipeline-level
data recipe. The effective pipeline input is derived from the selected stage
metadata and each stage's declared input shape. A module-owned data generator may
then fill dynamic values from project data recipes before browser execution.

By default, input is generated deterministically from:

```text
pipelines/{module}/{pipeline}.json
data-templates/{module}/defaults.json
data-templates/{module}/rules.json
data-templates/{module}/scenarios/*.json
data-templates/{module}/date-sets/*.json
data-templates/{module}/stage-data/**/*.json
```

An environment may select a project data profile:

```json
{
  "name": "region-dev",
  "dataProfile": "region-dev"
}
```

Stage data files may contain a local `profiles` object. The generator merges only the active profile into that stage input:

```text
base stage data + profiles[env.dataProfile] -> final stage input
```

`profiles` is a data-authoring helper and is not copied into final `input.json`. Keep this for environment-specific or site-specific input values, such as different test users, vendors, or reference data. Do not fork a pipeline just to change data for an environment.

AI or a human can override generated input with partial params:

```bash
pnpm regressionwright run <pipeline-id> --input-params ./input-params.json --headed
```

Inline JSON works for small overrides:

```bash
pnpm regressionwright run <pipeline-id> --input-params '{"field":{"name":"value"}}' --headed
```

The run writes:

```text
artifacts/runs/{pipeline}/{runId}/plan.json
artifacts/runs/{pipeline}/{runId}/input.json
artifacts/runs/{pipeline}/{runId}/run-context.json
artifacts/runs/{pipeline}/{runId}/summary.json
```

Stages pass data only through the pipeline-level run context. Do not pass hidden state between stages.

Stage input validation is stage-scoped. The harness reads `input.stageInputs[stageRef].value` for the current stage and validates that value against the selected stage contract. A stage normally maps to one pipeline input block through `dataKey`; if it needs a composed input, stage metadata can declare `dataKeys`, and the stage value becomes an object keyed by those data keys.

External `--input-params` overrides are merged into the final `input.json` before execution. The harness also syncs affected `stageInputs` from the updated top-level input blocks, so AI-generated or user-supplied params are validated and executed through the same stage-scoped input path.

Normal runs must enter through the harness CLI so the data node writes `plan.json` and `input.json`. Raw Playwright is debug-only and requires `E2E_REGRESSION_DEV_FALLBACK=1`.

## Runtime Performance

The generic package includes an optional Playwright performance monitor:

```js
import { createPerformanceMonitor } from '@regressionwright/core/performance-monitor.mjs';
```

It records explicit measurement windows chosen by project stage code:

```text
initial-render  page load or first application render
action          button click, submit, save, approve, or similar user action
```

The monitor does not infer business readiness. A stage must wrap the action and
its own ready condition, then the monitor records duration, backend API timing,
failed backend APIs, console errors, page errors, long tasks, and navigation
timing when available. Backend API calls are grouped by method and path with
P90/P95 totals plus queue, stall, and server-response timing.

Reports are written under the current run directory:

```text
performance.json
performance-summary.md
```

## Optional Reporters

Playwright reporters are project-level presentation integrations. The scaffold
supports `--reporter stagewright`, which adds StageWright to the generated
project while retaining the standard Playwright HTML report. Core does not
depend on StageWright.

Reporter output is observational only. It must not replace stage contracts,
check sets, checkpoints, or `summary.json` as the source of pipeline status.
The generated StageWright configuration disables cloud upload and managed AI
features by default.

## Resume

Resume is a framework-level way to continue from an earlier run artifact:

```bash
pnpm regressionwright resume artifacts/runs/{pipeline}/{runId}
pnpm regressionwright resume artifacts/runs/{pipeline}/{runId} --from <stage-ref>
```

The source run must contain:

```text
plan.json
input.json
run-context.json
```

The CLI creates a new run, copies the source input, loads the source run context, and executes the selected remainder. The target stage is the failed checkpoint, or the first planned stage without a passed checkpoint. `--from` overrides that selection.

Resume start selection is metadata-driven:

```text
target failed/pending stage
  -> walk backward through pipeline stage refs
  -> nearest resumeBoundary=true
  -> execute from that boundary onward
```

`resumeBoundary` is declared on the pipeline stage ref because it is a workload-level recovery point. Every executed stage still writes normal checkpoint artifacts.

The harness does not understand business recovery details. If a boundary stage or a following stage is not idempotent, the project stage executor must use the restored run context to safely skip, verify existing state, choose an internal path, or fail with a structured blocked/error state.

## Stage Checks

The contract output schema is the stable minimum. A stage can also select a named check set:

```text
checks/{module}/{stage}/{checks}.json
```

Stage metadata can declare `defaultChecks`; a pipeline stage ref can override it with `checks`. During execution, the harness validates the contract output schema first, then the selected check set output schema.

Keep this relationship simple:

```text
stage definition -> declares defaultChecks and available checks by file
pipeline stage ref -> selects checks by id
checks file -> owns assertion schema for that checks id
run checkpoint -> records which contract/checks passed
diagnose summary -> reports stageResults for every planned stage
```

Do not put assertion rules in pipeline JSON. A pipeline composes stage refs; a stage owns its checks.

The built-in schema validator intentionally supports a small JSON Schema subset:

- structure: `type`, `required`, `properties`, `items`
- exact values: `const`, `enum`
- arrays and strings: `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`
- numbers: `minimum`, `maximum`
- formats: `uri`, `date-time`

If a check needs richer assertions, prefer turning that fact into an explicit boolean or value in the stage output, then assert it with this schema subset. Do not add broad schema features until a real stage needs them.

## Adding A New Module

For a new project/module, add a module pack instead of changing the generic runner:

```text
src/modules/{module}/harness-adapter.mjs
src/modules/{module}/run-data.mjs
src/modules/{module}/run-context.ts
tests/{module}/pipeline-runner.ts
tests/{module}/stages/*.ts
pipelines/{module}/regression.json
stage-registry/{module}.json
stages/{module}/{stage}/{variant}.json
contracts/{module}/{stageId}.json
checks/{module}/{stage}/*.json
data-templates/{module}/...
```

Then update:

```json
{
  "schemaVersion": 1,
  "defaultModule": "{module}",
  "modules": {
    "{module}": {
      "description": "Short project/module description.",
      "adapterPath": "src/modules/{module}/harness-adapter.mjs"
    }
  }
}
```

The manifest is the module-pack boundary. Core resolves the module adapter from `modules.{module}.adapterPath`; if `modules` is declared, a requested module must be registered there.

Required adapter exports:

```js
export const defaultPipelineId = '{module}-regression';
export const pipelineRunnerModule = 'tests/{module}/pipeline-runner.ts';
```

The generic Playwright spec is provided by the harness package. Only set `playwrightSpecPath` in an adapter when a module intentionally needs a custom top-level Playwright spec.

Required module runner export:

```ts
export async function createPipelineRunner({ browser, testInfo }) {
  return {
    run,
    async runStage(stage) {},
    async close() {},
  };
}
```

Rule of thumb:

- Put reusable execution mechanics in `src/core`.
- Put project vocabulary and UI behavior in `src/modules/{module}` and `tests/{module}`.
- Put pipeline composition in `pipelines/{module}`.
- Put stage contracts in `contracts/{module}`.
- Put assertion variants in `checks/{module}`.
- Put project data recipes and reusable defaults in `data-templates/{module}`.
- Promote something to `src/core` only after a second module proves it is actually generic.
