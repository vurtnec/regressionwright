# Extend Harness

Use this reference when adding or changing a pipeline, stage, variant, or module.

## Stage Model

A stage is a deterministic workflow node with:

- `stage`: the capability being exercised.
- `variant`: one supported vertical implementation path.
- Optional `actor`: the business participant for multi-actor flows.
- Optional `input`: the selected stage input set.
- Optional `checks`: the selected assertion set.
- Metadata: requirements, produced outputs, side effects, tags, implementation path, and contract path.
- Contract: `inputSchema`, `outputSchema`, and `errorSchema`.
- Check set: optional extra output assertions for a named coverage level, stored outside the executor.
- Executor: deterministic Playwright code for web, Appium/WebdriverIO code for native mobile, or `miniprogram-automator` code for WeChat Mini Programs.

Pipeline composition should reference `stage` + `variant` where possible. Exact stage ids are acceptable for temporary flows.

## Extension Workflow

1. Read the target pipeline, stage metadata, contracts, and executor registry.
2. Read the existing implementation before editing.
3. Grep callers before modifying shared helpers or page-object functions.
4. Add or update the contract first so inputs, outputs, and errors are explicit.
5. Add or update stage metadata.
6. Put generated data defaults in `data-templates/{module}/stage-data/...`.
7. Put optional assertion variants in `checks/{module}/{stage}/{checks}.json`.
8. Register the executor.
9. Run the smallest valid flow visibly first.
10. Run the broader pipeline after the new stage is stable.

## Metadata Rules

Keep project/domain facts out of the skill and inside metadata:

- Business labels, stage names, and variants go in stage metadata.
- Allowed input values go in contract schema.
- Data defaults and scenario coverage go in data templates.
- Assertion variants go in check sets.
- Pipeline ordering goes in pipeline JSON.
- Environment-specific reference data goes in stage-data `profiles`, selected by
  `config/{env}.json` `dataProfile`.
- Secrets and local-only values go in ignored env files.

Optional Playwright reporters belong in the consuming project's
`playwright.config.ts`. A reporter may present run evidence, but it must not
determine stage status or replace contracts, check sets, or `summary.json`.

Stage input validation is scoped to the selected stage ref. The stage contract `inputSchema` must describe `input.stageInputs[refId].value` directly. Use `dataKey` for a single pipeline input block, or `dataKeys` when the stage value must compose several blocks, for example credentials plus a business action payload.

If AI needs to know a fact to run the pipeline, make the fact discoverable from those files.

## Stage Handoff

Pass data through persisted pipeline context:

```text
input.json -> stage output -> run-context.json -> next stage input
```

Do not rely on hidden globals, browser-only memory, or AI memory for stage handoff.

## Error Shape

Each failed stage should emit a structured error matching its `errorSchema`.

Include evidence paths when available:

- Run directory.
- Executor output directory (`playwright`, `appium`, or `miniprogram`).
- Screenshot.
- Trace.
- Video.
- Current URL.
- Appium session id and device/platform details when applicable.
- Primary selector or business identifier involved.

## Daily Vs Initialization

Daily execution:

- Stage internals are black boxes.
- AI diagnoses from schemas, metadata, inputs, outputs, and evidence.
- AI does not manually complete UI actions.

Initialization or repair:

- AI may inspect app code, traces, browser behavior, and stage internals.
- The result must be a deterministic executor and updated metadata/schema.
