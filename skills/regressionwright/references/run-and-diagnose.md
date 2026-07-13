# Run And Diagnose

Use this reference when running a pipeline or diagnosing a failed run.

## Run

Discover first:

```bash
pnpm regressionwright registry [module]
```

Run a known pipeline:

```bash
pnpm regressionwright run <pipeline-id> --headed
```

Run daily mode, which writes diagnosis summary after execution:

```bash
pnpm regressionwright daily <pipeline-id>
```

Run AI-generated daily mode when wider dynamic coverage is requested. Generate a small schema-valid params file first, then pass it through the same daily command so the final run still writes the normal daily diagnosis:

```bash
pnpm regressionwright ai-params-context <pipeline-id> --env <env-name>
pnpm regressionwright daily <pipeline-id> --input-params <json-file-or-inline-json>
```

The context command is the AI boundary for params generation. It tells the agent which paths are safe to override and which paths are copy-only or blocked. The daily command only consumes already-generated params. Manual runs without `--input-params` stay in stable daily mode. For manual deterministic variation, use supported project options such as `--data-variant <variant-id>`.

Run a temporary flow only after checking stage prerequisites:

```bash
pnpm regressionwright run --stages <stage-id-or-stage/variant[@actor],...> --headed
```

Run with AI-generated params:

```bash
pnpm regressionwright run <pipeline-id> --input-params <json-file-or-inline-json> --headed
```

Resume a failed run:

```bash
pnpm regressionwright resume artifacts/runs/<pipeline-id>/<run-id> --headed
```

Override the failed-stage selection when the user gives a specific stage ref:

```bash
pnpm regressionwright resume artifacts/runs/<pipeline-id>/<run-id> --from <stage-ref> --headed
```

Resume creates a new run. It reuses the source run's `input.json` and `run-context.json`, finds the failed or first pending stage, walks backward to the nearest `resumeBoundary: true` stage ref, and executes from that boundary onward. If no boundary exists before the target stage, it starts from the target stage.

Do not treat resume as a generic retry of every side effect. Non-idempotent stages must be resume-safe internally: read the run context, reuse already-created state when present, skip when the stage output is already valid, or fail as `blocked` when safe recovery is unclear.

## Evidence Order

Inspect structured artifacts before opening browser traces:

```text
artifacts/runs/<pipeline-id>/<run-id>/summary.json
artifacts/runs/<pipeline-id>/<run-id>/plan.json
artifacts/runs/<pipeline-id>/<run-id>/input.json
artifacts/runs/<pipeline-id>/<run-id>/run-context.json
artifacts/playwright/**/error-context.md
artifacts/playwright/**/test-failed-*.png
artifacts/playwright/**/trace.zip
artifacts/runs/<pipeline-id>/<run-id>/appium/*.png
```

Generate diagnosis when available:

```bash
pnpm regressionwright diagnose artifacts/runs/<pipeline-id>/<run-id>
```

Use `summary.json.errorCode`, `failedStageId`, and `checkpoint.error` as primary signals. Use screenshot, trace, and logs as supporting evidence.

Use `summary.json.stageResults` to see the planned stage refs, selected checks, checkpoint status, and passed assertion metadata. Do not infer checks from pipeline JSON alone; pipeline refs only select stage-owned checks.

For resume runs, also inspect:

```text
plan.json.resume
input.json.data.resume
run-context.json.resume
```

These fields show the source run, target failed stage, selected resume boundary, and executed remainder.

## Daily-Run Boundary

For daily runs, AI observes the run from outside the stage:

- Read `plan.json`, `input.json`, `run-context.json`, `summary.json`, and retained evidence.
- Do not take over the browser to finish the stage manually.
- Do not mutate runtime state to force success.
- If deterministic execution cannot proceed safely, classify and stop.

For `ai-generated-daily`, AI may generate `--input-params` before execution starts. Once the pipeline starts, the same black-box stage boundary applies.

After classification, script maintenance can enter initialization/repair mode, where AI may inspect internals to fix deterministic code.

## Classification

`passed`:

- All requested stages completed.
- Expected business identifiers and stage checkpoints are present.

`env_issue`:

- Auth expired or interactive login required.
- Browser revision missing.
- Deployment, network, mailbox, captcha, or third-party dependency blocks execution.
- Product behavior is not contradicted by valid UI evidence.

`planning_error`:

- Requested flow misses required prior outputs.
- Stage order is invalid.
- Required runtime input was not supplied.
- Contract says the stage cannot run with the chosen context.

`script_issue`:

- Selector is stale.
- UI changed but valid business behavior still works.
- Input data does not match available UI options.
- Stage contract, metadata, or generated data is incomplete.
- Timeout has no evidence of product failure.

`app_bug`:

- Real UI flow with valid data cannot complete.
- Product returns unexpected business error.
- Created state contradicts expected state.
- Evidence shows behavior a user would also hit.

`blocker`:

- Human input or environment change is required.
- Continuing would risk destructive data or misleading results.

## Bug Report Shape

For `app_bug`, report:

- Repro steps.
- Actual behavior.
- Expected behavior.
- Environment and pipeline/run id.
- Failed stage id.
- Screenshot or trace path.
- Relevant `input.json` and `run-context.json` fields.
