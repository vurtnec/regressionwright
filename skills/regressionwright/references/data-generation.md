# Data Generation

Use this reference when AI needs to create or review `--input-params`.

## Boundary

AI may generate input params before the pipeline starts. AI must not mutate data inside a running stage.

The deterministic flow is:

```text
pipeline data node -> compose selected stage inputs -> base generated input -> AI params merge -> final input.json -> per-stage input schema validation -> stage execution
```

Daily data has two layers:

- `stable-daily`: no AI params. The project data generator selects from project-owned scenarios and rules.
- `ai-generated-daily`: AI creates `--input-params` before execution to broaden coverage while still using the project generator as the base.

Use `ai-generated-daily` only when the user explicitly asks for AI-generated data, broader dynamic coverage, exploratory coverage, or unusual scenario variation. The generated data must look like the project's examples and remain reproducible through the saved `input.json`.

`ai-generated-daily` is agent-mediated. A manual CLI run with no params, such as `pnpm regressionwright daily <pipeline-id>`, remains `stable-daily`. If a human wants broader deterministic coverage without an agent, use project-supported generator knobs, for example `--data-variant <variant-id>`, instead of expecting the CLI to synthesize AI params.

## Protocol

1. Run the context command for the target pipeline and environment:

```bash
pnpm regressionwright ai-params-context <pipeline-id> --env <env-name>
```

2. Generate a small `--input-params` object using only `recommendedOverridePaths` and `allowedOverridePaths`.
3. Treat `copyOnlyPaths` as deterministic project data. Do not rewrite them unless copying an existing known-good value.
4. Treat `blockedOverridePaths` as off limits.
5. Prefer the provided `paramsTemplate` shape. Do not rewrite the final `input.json`.
6. Run the exact `command` printed by the context output, replacing `<params-file>` with the generated file. This keeps deterministic seed data aligned between context and execution.
7. Let schema validation fail before browser execution if params are invalid.

Pipeline input is the composition of the selected stage inputs. Pipeline JSON does
not name a pipeline-level data recipe; project data recipes belong to the
module data generator and `data-templates/{module}`.

Environment-specific data should use `config/{env}.json` `dataProfile` plus stage-data `profiles`:

```text
base stage data + profiles[env.dataProfile] + --input-params -> final input.json
```

Use this for environment or site differences while keeping one pipeline. Do not add environment branches to pipeline JSON just to change data.

When using `--input-params`, prefer top-level pipeline input blocks such as `{ "feature": { ... } }` unless the stage metadata specifically requires a composed `stageInputs` override. The harness syncs matching `stageInputs` after merging params.

For daily diagnosis output with AI-generated params, prefer:

```bash
pnpm regressionwright ai-params-context <pipeline-id> --env <env-name>
pnpm regressionwright daily <pipeline-id> --input-params <json-file-or-inline-json>
```

## UI-Constrained Values

For dropdowns, search fields, user pickers, category fields, unit fields, status values, or other UI-constrained values:

- Use schema `enum` or `const` first.
- If the schema lacks an enum, use values already present in stage data templates or a prior successful `input.json`.
- If neither exists, treat it as initialization work: inspect the UI or app code, then update contract/schema or stage metadata before relying on the value.
- Do not invent plausible business values just because they sound realistic.

## Dynamic Dates

Prefer stage-owned date inputs and template rules over hard-coded timestamps.

Only put explicit dates into AI params when the user asks for a specific schedule or the stage contract requires that override.

## Params Shape

Generate the smallest useful params object. Do not rewrite the whole final `input.json` unless necessary. Keep business text realistic and free of meta-test wording such as AI, automated test, regression, test data, scenario id, run id, or template, unless the context explicitly asks for it.

Good params usually override:

- Text fields for scenario variety.
- Other paths explicitly listed by the context command.

Bad params usually override:

- Runtime outputs from previous stages.
- Browser/session state.
- Date fields already controlled by the selected stage input.
- UI-constrained fields not backed by schema or metadata.
- Actors, accounts, vendors, approvers, mailboxes, categories, units, prices, or coverage rules unless the context explicitly allows the path.

## Failure Handling

If validation fails, classify it as data/schema/planning work, not an app bug.

Fix in this order:

1. Correct invalid params.
2. If the params are valid business data but schema is incomplete, update the contract.
3. If the UI supports only a narrower set, encode that set in schema or metadata.
4. Rerun from the pipeline start or from a valid existing-context stage.
