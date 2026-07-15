# __PROJECT_NAME__

This is an E2E regression project generated from `@vurtnec_/regressionwright`.

## Quick Start

Run these from this project root:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm regressionwright --integration codex
pnpm regressionwright registry
pnpm regressionwright run --headed
```

After a run, open the latest artifacts under:

```text
artifacts/runs/{pipeline}/{runId}/
```

Useful files:

```text
plan.json
input.json
run-context.json
performance-summary.md
playwright-report/index.html
```

__OPTIONAL_REPORTER_README__

## Daily Run

Use `daily` for the normal deterministic regression entry:

```bash
pnpm regressionwright daily --env dev
```

Use `run --headed` when authoring or debugging stages:

```bash
pnpm regressionwright run --env dev --headed
```

## AI Skills

```bash
pnpm regressionwright --integration codex
pnpm regressionwright integration install claude
pnpm regressionwright integration install all
```

These commands write project-level files only:

```text
.agents/skills/regressionwright/
.claude/skills/regressionwright/
```

## Environments and Sites

Add environments as `config/{env}.json`. Add sites under the module's `sites`
object:

```json
{
  "name": "dev",
  "dataProfile": "dev",
  "__MODULE_ID__": {
    "defaultSite": "default",
    "sites": {
      "default": {
        "baseUrl": "https://example.com",
        "expectedTitleContains": "Example"
      },
      "hk": {
        "baseUrl": "https://hk.example.com",
        "expectedTitleContains": "HK"
      }
    }
  }
}
```

Use `dataProfile` when environments or sites share the same pipeline but need
different reference data. Stage data files can define
`profiles.<dataProfile>` overrides.

Run a specific site:

```bash
pnpm regressionwright run --env dev --site default
pnpm regressionwright daily --env dev --site default
```

## Project Model

```text
pipeline -> selected stage refs -> module data generator -> input.json -> deterministic stage executors
```

Common commands:

```bash
pnpm regressionwright registry
pnpm regressionwright diagnose artifacts/runs/{pipeline}/{runId}
pnpm regressionwright resume artifacts/runs/{pipeline}/{runId} --headed
pnpm regressionwright ai-params-context {pipeline-id} --env dev
pnpm check
```

When adding real coverage:

- Add stage metadata under `stages/__MODULE_ID__/{stage}/{variant}.json`.
- Add stage contracts under `contracts/__MODULE_ID__/`.
- Add optional assertion sets under `checks/__MODULE_ID__/{stage}/`.
- Add reusable stage input defaults under `data-templates/__MODULE_ID__/stage-data/{stage}/`.
- Register stage executors in `tests/__MODULE_ID__/pipeline-runner.mjs`.
- Compose the business workflow in `pipelines/__MODULE_ID__/regression.json`.
- Mark safe recovery points in pipeline stage refs with `resumeBoundary: true`.

## Project Files

```text
config/harness.json
pipelines/__MODULE_ID__/
stage-registry/__MODULE_ID__.json
stages/__MODULE_ID__/
contracts/__MODULE_ID__/
checks/__MODULE_ID__/
data-templates/__MODULE_ID__/
src/modules/__MODULE_ID__/
tests/__MODULE_ID__/
```

Keep business facts in stage metadata, contracts, checks, data templates, and
module code. Do not put project-specific behavior in the harness package.
