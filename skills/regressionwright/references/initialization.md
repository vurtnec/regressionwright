# Initialization

Use this reference when creating or repairing deterministic pipeline coverage.

Initialization is not a daily run. In this mode, AI may inspect stage internals because the goal is to author or repair deterministic code that will later run unattended.

## Entry Conditions

Start initialization when:

- The user asks for a new stage, variant, module, or pipeline.
- A daily run classifies a failure as script drift or incomplete contract/schema.
- A stage is not yet stable enough to be part of daily regression.
- UI-constrained data is missing from metadata/schema and must be discovered.

## Workflow

1. Read `config/harness.json` and identify the target registered module.
2. Run `pnpm regressionwright registry [module]`.
3. Read the target pipeline, stage metadata, contracts, and data templates.
4. Determine whether target application source is available. Discover its path from the workspace and project docs first; when it cannot be found and would materially improve authoring or repair, ask the user whether it can be provided. If available, inspect only source relevant to the current stage: routes, screens/components, selectors or accessibility identifiers, and input constraints. Source absence must not block black-box initialization.
5. Read the existing stage implementation before editing.
6. Grep callers before changing shared helpers or page-object functions.
7. Update metadata and contract first, then implementation.
8. Run the smallest valid stage flow visibly.
9. Diagnose failures from artifacts; use browser or device inspection only to repair the deterministic executor.
10. Promote the stage into the pipeline only after it can run without AI intervention.

Application source is repair evidence, not hidden stage input. Access to source does not change the daily-run black-box boundary.

## Allowed In Initialization

- Inspect app code, selectors, traces, screenshots, and browser/device behavior.
- Drive the browser or device manually to understand the workflow.
- Edit stage implementation, module adapter, metadata, schema, and data templates.
- Create focused self-checks for parsers, generators, and schema rules.

## Not Allowed In Initialization

- Hide manual AI browser/device actions inside a daily-run stage.
- Store important handoff data only in AI memory.
- Patch `input.json` or `run-context.json` after execution to make a failed stage appear passed.
- Promote a stage into daily regression without a deterministic executor.

## Promotion Checklist

Before a stage or variant joins a daily pipeline:

- Stage metadata declares `stage`, `variant`, `requires`, `produces`, side effects, and implementation path.
- Contract defines input, output, and error shape.
- Stage data defaults exist when generated input is required.
- The executor writes meaningful run context fields.
- Failures include structured evidence.
- The stage has passed the smallest valid flow at least once without manual browser/device takeover.
