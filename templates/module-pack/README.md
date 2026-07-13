# Module Pack Template

Use this as the minimal shape for a new project/module pack.

```text
config/harness.json
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

The framework side should not know the module's business vocabulary. Put project behavior behind `harness-adapter.mjs`, and register the module in `config/harness.json`:

```json
{
  "schemaVersion": 1,
  "defaultModule": "{module}",
  "modules": {
    "{module}": {
      "description": "Project regression module.",
      "adapterPath": "src/modules/{module}/harness-adapter.mjs"
    }
  }
}
```

Required adapter exports:

```js
export const defaultPipelineId = '{module}-regression';
export const pipelineRunnerModule = 'tests/{module}/pipeline-runner.ts';
export const playwrightSpecPath = 'tests/harness/pipeline-runner.spec.mjs';
```

For an Appium module, replace the Playwright spec export with:

```js
export const executorType = 'appium';
```

Optional adapter exports:

```js
export const playwrightSpecPath = 'tests/custom-runner.spec.ts';
export function createRuntimeInput({ plan, options }) {}
export function validateRunOptions({ projectOptions }) {}
export function applyRunEnv({ envVars, options, plan, runtimeInput }) {}
export function afterRun({ result, executorType, plan, runDir }) {}
export function summarizeDiagnose({ context, plan, input }) {}
export function helpExamples() {}
export function createAuthSessionConfig({ envName, options }) {}
export function waitForAuthReady(page, authConfig) {}
export function createBrowserProfileConfig({ envName, options }) {}
```

The module runner must export:

```ts
export async function createPipelineRunner({ browser, testInfo }) {
  return {
    run,
    async runStage(stage) {},
    async close() {},
  };
}
```

An Appium runner exports the same return shape. It creates and closes its own
WebdriverIO session; the built-in Appium stage loop does not pass Playwright
fixtures.

Do not add project-specific branches to `scripts/harness.mjs` or `tests/harness/pipeline-runner.spec.mjs`.
