---
name: regressionwright
description: Use this skill when operating or maintaining a stage/pipeline based deterministic E2E regression harness: discover pipelines and stages, run regression flows, generate schema-valid input params, inspect evidence, diagnose failures, or extend stage-based flows. Domain details must come from pipeline metadata, stage metadata, contracts, and data templates.
---

# RegressionWright

This skill is a project-independent operating guide for AI-assisted deterministic E2E regression harnesses.

Use it to preserve the boundary:

- AI plans, observes, diagnoses, generates input params, and edits harness code.
- The harness executes deterministic E2E stages.
- Daily runs treat each stage as a black box: inspect stage input, output, structured error, and evidence artifacts only.
- Initialization and stage authoring may inspect browser traces, app code, and stage internals to create or repair deterministic executors.

## What This Skill Does Not Contain

Do not encode business-domain details in this skill:

- No module-specific stage lists.
- No allowed UI dropdown values.
- No actor, approver, account, mailbox, or password values.
- No business date windows.
- No internal stage behavior.

Those belong in project-owned artifacts:

```text
pipelines/{module}/*.json
stage-registry/{module}.json
stages/{module}/**/*.json
contracts/{module}/*.json
checks/{module}/**/*.json
data-templates/{module}/**/*.json
src/modules/{module}/harness-adapter.mjs
config/harness.json
config/*.json
```

If a value is fragile or UI-constrained, put it in contract schema, stage metadata, or data templates. Do not patch this skill with domain facts.

## Discovery

First locate the regression project root. It is the directory that contains `config/harness.json`; project-owned packs then live under `pipelines/`, `stage-registry/`, `stages/`, `contracts/`, and `data-templates/`.

Read the project metadata before running or changing anything:

1. Read `config/harness.json` to identify registered modules and the default module when the user did not specify one.
2. List `pipelines/{module}/*.json` to find pipeline ids.
3. Run the harness registry for the target module when available:

```bash
pnpm regressionwright registry [module]
```

4. Read the chosen pipeline JSON to see selected stage refs, variants, actors, and selected checks.
5. Read only the selected stage metadata, contracts, and checks needed for the task.

For detailed operation steps, read `references/run-and-diagnose.md`.

## Core Commands

Use the package-manager command exposed by the project. In this harness it is normally:

```bash
pnpm regressionwright run <pipeline-id> --headed
pnpm regressionwright daily <pipeline-id>
pnpm regressionwright ai-params-context <pipeline-id> --env <env-name>
pnpm regressionwright daily <pipeline-id> --input-params <json-file-or-inline-json>
pnpm regressionwright resume artifacts/runs/<pipeline-id>/<run-id> --headed
pnpm regressionwright run --stages <stage-id-or-stage/variant[@actor],...> --headed
pnpm regressionwright diagnose artifacts/runs/<pipeline-id>/<run-id>
pnpm regressionwright auth --module <module>
pnpm regressionwright profile --module <module>
pnpm regressionwright --integration codex
pnpm regressionwright integration install claude
pnpm run create ../my-project-regression-test --module my-project --core-package "file:$PWD" --integration codex
pnpm run create ../my-ios-regression-test --module my-ios-app --executor appium --core-package "file:$PWD" --integration codex
pnpm check
```

Prefer pipeline ids for known workloads. Use temporary stage flows only after validating prerequisites through registry and contracts.

## Resume Runs

Use resume when a previous run has a valid `plan.json`, `input.json`, and `run-context.json` and the user wants to continue from a failure:

```bash
pnpm regressionwright resume artifacts/runs/<pipeline-id>/<run-id> --headed
pnpm regressionwright resume artifacts/runs/<pipeline-id>/<run-id> --from <stage-ref> --headed
```

The harness finds the failed or first pending stage, then walks backward to the nearest pipeline stage ref with `resumeBoundary: true`. It creates a new run using the old input and context, then executes from that boundary onward.

Keep the boundary generic:

- `resumeBoundary` belongs in pipeline stage refs, not in the generic framework.
- Every stage still records normal checkpoint artifacts.
- A stage that is non-idempotent must make its own resume-safe decision from run context, such as skip, verify existing state, or use an alternate internal path.
- AI may diagnose resume output through artifacts, but must not manually complete the running stage browser.

## Daily Run Layers

Daily execution has two supported layers:

- `stable-daily`: run `pnpm regressionwright daily <pipeline-id>` with the project data generator only. This is the default when the user asks for a daily run without asking for AI-generated data. It rotates through project-owned scenarios, rules, and stage inputs deterministically by run id.
- `ai-generated-daily`: first run `pnpm regressionwright ai-params-context <pipeline-id> --env <env-name>`, then generate the smallest useful `--input-params` object using only the paths allowed by that context, then run the `command` printed by the context output. Use this when the user asks for AI-generated data, wider dynamic coverage, fuzzier scenario variation, or exploratory daily coverage.

The CLI does not generate AI params by itself. If a human manually runs `pnpm regressionwright daily <pipeline-id>` without `--input-params`, that is intentionally `stable-daily`, not AI-generated daily. For manual wider coverage without an agent, prefer supported deterministic knobs such as `--data-variant <variant-id>`.

AI-generated daily data must follow the context output, not broad discovery. Treat `allowedOverridePaths` as the boundary, `copyOnlyPaths` as project-owned data, and `blockedOverridePaths` as off limits. Prefer business text fields. Do not invent dropdown, picker, actor, vendor, mailbox, category, unit, approval-route, date, price, or coverage values.

## AI Data Generation

AI-generated data must enter through the pipeline data node as saved input params:

```bash
pnpm regressionwright ai-params-context <pipeline-id> --env <env-name>
pnpm regressionwright run <pipeline-id> --input-params <json-file-or-inline-json> --headed
pnpm regressionwright daily <pipeline-id> --input-params <json-file-or-inline-json>
```

Use the context command before writing params. It is the low-freedom interface between deterministic project data and AI-written scenario text. Generate only allowed paths, keep the JSON small, make business text realistic, and run the exact `command` printed by the context output so deterministic seed data stays aligned. Avoid meta-test wording such as AI, automated test, regression, test data, scenario id, run id, or template unless the context explicitly asks for it.

The harness builds the base input, merges params, writes final `input.json`, validates each selected stage input against that stage's `inputSchema`, and only then starts browser execution.

When generating or reviewing input params, read `references/data-generation.md`.

## Failure Diagnosis

Classify failures before changing code. Use structured run output first, then screenshots and traces as supporting evidence.

Read `references/run-and-diagnose.md` when a run fails.

High-level classification:

- `env_issue`: auth, browser install, network, deployment, or external service problem.
- `planning_error`: invalid pipeline or temporary stage composition.
- `script_issue`: selector, timeout, stale data, or schema mismatch without evidence of product breakage.
- `app_bug`: valid data through real UI exposes wrong product behavior.
- `blocker`: safe progress requires human input or environment change.

## Extension

When adding a stage, variant, module, or pipeline, read `references/extend-harness.md`.

When creating or repairing deterministic coverage, read `references/initialization.md`.

When creating a new standalone regression project from the harness source root, use the scaffold command instead of copying an existing project pack:

```bash
pnpm run create ../my-project-regression-test --module my-project --core-package "file:$PWD" --integration codex
```

Append `--reporter stagewright` only when the user asks for the optional local
StageWright Playwright report. Reporter output is observational and does not
replace harness checks or diagnosis.

Use `--executor appium` for a native mobile project. Read the generated device
configuration and stage metadata before running. Do not invent capabilities,
device ids, bundle ids, app paths, signing settings, or accessibility ids.

Install this skill at project level when an agent integration needs to discover
the harness runbook from the regression project:

```bash
pnpm regressionwright --integration codex
pnpm regressionwright integration install claude
```

These commands write only into the current regression project:

```text
.agents/skills/regressionwright/
.claude/skills/regressionwright/
```

Keep extensions metadata-first:

- Define the stage description, `stage`, `variant`, `actor` support, requirements, produced outputs, and side effects in stage metadata.
- Define accepted input, output, and error shape in contracts.
- Define assertion variants in stage-owned checks files. Pipelines may select a checks id but must not define assertion rules.
- Put reusable generated data in project data templates.
- Keep execution deterministic; do not rely on AI operating the browser during daily runs.

## Architecture

If architecture files exist under `docs/`, read them only when changing the harness design or explaining the model. The core model is:

```text
pipeline metadata -> data node -> input.json -> deterministic stages -> run-context.json -> stageResults/evidence/diagnosis
```

AI can supervise the pipeline through schemas and metadata. It should not become an invisible executor inside daily-run stages.
