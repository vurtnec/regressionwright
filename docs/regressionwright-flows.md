# RegressionWright Flows

This note complements the architecture document with small operational diagrams.

The diagrams intentionally stay generic. Project details belong in module pack docs.

## Initialization Flow

Initialization mode is used to create or repair deterministic coverage. AI may inspect stage internals because the purpose is to produce stable stage code and metadata.

```mermaid
flowchart LR
  Goal["Business Goal<br/>new flow or missing coverage"]
  Discover["Discover<br/>pipeline · stage metadata · app code"]
  Author["Author / Repair<br/>stage code · contract · checks · data"]
  Run["Run Smallest Valid Flow<br/>headed if useful"]
  Evidence["Inspect Evidence<br/>trace · screenshot · output · app logs"]
  Classify{"Outcome"}
  Stable["Promote To Pipeline"]
  Bug["Record Product Bug"]
  Blocked["Human Takeover"]

  Goal --> Discover
  Discover --> Author
  Author --> Run
  Run --> Evidence
  Evidence --> Classify
  Classify -->|script issue| Author
  Classify -->|metadata/schema gap| Author
  Classify -->|product bug| Bug
  Classify -->|blocked| Blocked
  Classify -->|stable| Stable
```

Rules:

- AI may inspect browser state, traces, app code, and stage internals.
- The result must be deterministic executor code plus updated metadata, contract, checks, and data.
- A stage should not join daily regression until it can run without manual browser takeover.

## Daily Run Flow

Daily run mode treats stage execution as black-box. AI observes from the outside.

```mermaid
flowchart LR
  Start["Start<br/>scheduler / terminal / AI"]
  Build["Build Plan + Input"]
  Execute["Run Stages<br/>black-box"]
  Validate["Validate<br/>contracts + checks"]
  Result{"Pass?"}
  Summary["summary.json"]
  Diagnose["AI Diagnose<br/>metadata + artifacts only"]
  Failure{"Failure Type"}
  Bug["Record Product Bug"]
  Repair["Enter Repair Mode"]
  Retry{"Retry Allowed?"}
  Stop["Stop<br/>human takeover"]

  Start --> Build
  Build --> Execute
  Execute --> Validate
  Validate --> Result
  Result -->|yes| Summary
  Result -->|no| Diagnose
  Diagnose --> Failure
  Failure -->|app bug| Bug
  Failure -->|script drift| Repair
  Repair --> Retry
  Retry -->|yes| Build
  Retry -->|no| Stop
  Failure -->|env / blocked / unclear| Stop
```

Rules:

- AI may read `plan.json`, `input.json`, `run-context.json`, `summary.json`, screenshots, traces, and logs.
- AI must not finish a failed stage by manually clicking inside the running browser.
- If repair is needed, switch to initialization/repair mode, update deterministic code, then rerun.

## Pipeline Execution Flow

This is what `pnpm regressionwright run <pipeline-id>` does.

```mermaid
sequenceDiagram
  participant O as Operator
  participant C as Harness CLI
  participant P as Planner
  participant D as Data Generator
  participant E as Env Data Profile
  participant R as Generic Runner
  participant M as Module Runner
  participant S as Stage Executor
  participant A as Real App
  participant V as Validator
  participant F as Artifacts

  O->>C: run pipeline
  C->>P: load pipeline + stage registry
  P->>D: compose stage input
  D->>E: apply dataProfile overrides
  D-->>F: write input.json
  P-->>F: write plan.json
  C->>R: dispatch selected Playwright or Appium executor
  R->>M: create project runner
  loop each planned stage
    R->>V: validate stage input
    R->>M: runStage(stageRef)
    M->>S: call deterministic executor
    S->>A: real UI / real external service
    S-->>F: update run-context.json
    R->>V: validate contract output
    R->>V: validate selected checks
    R-->>F: record checkpoint
  end
  R-->>F: write summary.json
```

Key point:

```text
Pipeline selects stage refs.
Stage refs select metadata, contract, input, and checks.
The runner executes deterministic code and validates artifacts.
```

## Stage Boundary Flow

The harness sees a stage through input, output, error, and checks.

```mermaid
flowchart LR
  StageRef["Stage Ref<br/>stage + variant + actor + checks"]
  Input["Stage Input<br/>input.stageInputs[refId].value"]
  ContractIn["inputSchema"]
  Executor["Deterministic Executor"]
  App["Real App"]
  Context["run-context.json"]
  ContractOut["contract.outputSchema"]
  Checks["checks.outputSchema"]
  Checkpoint["checkpoint<br/>contract + checks passed"]
  Error["structured error<br/>errorSchema"]

  StageRef --> Input
  ContractIn --> Input
  Input --> Executor
  Executor --> App
  App --> Executor
  Executor --> Context
  Context --> ContractOut
  ContractOut --> Checks
  Checks --> Checkpoint
  Executor -.failure.-> Error
```

Reference rule:

```text
Stage code calculates facts.
Contracts and checks assert those facts from run-context.
```

## AI-Generated Input Flow

AI-generated data is allowed before the pipeline starts. It becomes normal input after merge and validation.

```mermaid
flowchart LR
  Intent["User Intent<br/>broader coverage / custom data"]
  AI["AI Generates Params"]
  Params["input-params.json"]
  Defaults["Project Data Templates"]
  Profile["Environment Data Profile"]
  Merge["Merge + Sync Stage Inputs"]
  Input["input.json"]
  Run["Normal Pipeline Run"]

  Intent --> AI
  AI --> Params
  Defaults --> Merge
  Profile --> Merge
  Params --> Merge
  Merge --> Input
  Input --> Run
```

Once execution starts, the same daily-run black-box boundary applies.

Merge order is deterministic:

```text
base stage data + profiles[env.dataProfile] + input params
```

## Resume Flow

Resume starts a new run from a prior run artifact. It does not mutate the source run.

```mermaid
flowchart LR
  Source["Source Run<br/>plan · input · context"]
  Target["Failed / Pending Stage"]
  Boundary["Nearest Prior<br/>resumeBoundary"]
  NewRun["New Resume Run"]
  Context["Restored Context"]
  Execute["Execute Remainder"]
  Outcome{"Outcome"}
  Summary["summary.json"]
  Diagnose["Diagnose"]

  Source --> Target
  Target --> Boundary
  Boundary --> NewRun
  Source --> Context
  Context --> NewRun
  NewRun --> Execute
  Execute --> Outcome
  Outcome -->|pass| Summary
  Outcome -->|fail| Diagnose
```

Rules:

- `resumeBoundary` is declared on pipeline stage refs.
- If no earlier boundary exists, resume starts from the target failed or pending stage.
- Non-idempotent stages must be safe internally: reuse existing context, verify current state, skip when output already exists, or stop with a structured error.
- AI observes resume artifacts the same way as daily-run artifacts.

## Concept Reference

```text
Pipeline
  ordered Stage Refs

Stage Ref
  stage + variant + optional actor + optional checks + optional input + optional resumeBoundary

Stage
  reusable workflow capability

Variant
  concrete implementation path and metadata

Contract
  input/output/error schema

Checks
  named output assertion schema

Run
  plan.json + input.json + run-context.json + summary.json + evidence
```

Do not use `Node` as a separate core concept. In the pipeline, the position is a `Stage Ref`. The reusable business unit is a `Stage`. The vertical extension is a `Variant`.
