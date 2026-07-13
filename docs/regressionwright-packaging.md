# RegressionWright Packaging

`packages/core` is package-shaped as `@regressionwright/core`.

Users can consume the harness through a local source checkout with `file:$PWD`,
a local tarball with `file:<tarball>`, or a future published npm version.
The maintainer monorepo can also consume it through `workspace:*` during local
development.

## Package Layer

Package-owned files:

```text
bin/regressionwright.mjs
bin/create-regressionwright.mjs
scripts/harness.mjs
scripts/refresh-auth.mjs
scripts/open-browser-profile.mjs
src/core/
src/integrations/
tests/harness/
skills/regressionwright/
templates/
docs/framework.md
docs/regressionwright-architecture.md
docs/regressionwright-packaging.md
```

Project-owned files stay outside the package API:

```text
config/harness.json
config/{env}.json
pipelines/{module}/
stage-registry/{module}.json
stages/{module}/
contracts/{module}/
checks/{module}/
data-templates/{module}/
src/modules/{module}/
tests/{module}/
```

## Usage Shapes

### V1 Harness Source Mode

This is the first supported internal user mode. The user downloads only the
harness source project, not the maintainer monorepo.

1. From any parent directory, download the harness source and enter it:

```bash
git clone https://github.com/vurtnec/regressionwright.git
cd regressionwright
```

2. From the harness source root, install dependencies:

```bash
pnpm install
```

3. From the harness source root, scaffold a standalone regression project:

```bash
pnpm run create ../my-project-regression-test \
  --module my-project \
  --core-package "file:$PWD" \
  --integration codex
```

To add the optional StageWright Playwright reporter to the generated project,
include `--reporter stagewright`. Without that flag, the project keeps the
default Playwright list and HTML reporters only.

To generate an iOS Appium project instead, include `--executor appium`. The
generated project uses Appium 3, WebdriverIO, and the XCUITest driver install
script; it does not install Playwright or accept the StageWright reporter flag.

The target directory should be outside any existing pnpm workspace. If you are
testing from this maintainer monorepo at `packages/core`, use a target outside
the current workspace, for example:

```bash
pnpm run create ../../../my-project-regression-test \
  --module my-project \
  --core-package "file:$PWD" \
  --integration codex
```

4. From the generated project root, install and run:

```bash
cd ../my-project-regression-test
pnpm install
pnpm exec playwright install chromium
pnpm regressionwright registry
pnpm regressionwright run --env dev --site default --headed
```

If you used a different scaffold target, `cd` to that target instead.

The generated project depends on the local harness source:

```json
"@regressionwright/core": "file:/path/to/regressionwright"
```

### Local Release Demo Mode

Use this when you need to demonstrate a package-shaped release without
publishing to npm.

1. From the harness source root, create a tarball:

```bash
pnpm pack
```

2. From the harness source root, scaffold a standalone project from that tarball:

```bash
pkg="$PWD/regressionwright-core-0.1.0.tgz"
pnpm dlx --package "$pkg" create-regressionwright ../demo-regression-test \
  --module demo \
  --core-package "file:$pkg" \
  --integration codex
```

3. From the generated project directory, install and run:

```bash
cd ../demo-regression-test
pnpm install
pnpm exec playwright install chromium
pnpm regressionwright registry
pnpm regressionwright run --headed
```

The generated project depends on the local tarball:

```json
"@regressionwright/core": "file:../regressionwright-core-0.1.0.tgz"
```

### Future Npm Mode

After publishing `@regressionwright/core`, invoke the scaffold binary bundled in
that package:

```bash
pnpm dlx --package @regressionwright/core create-regressionwright my-project-regression-test \
  --module my-project \
  --integration codex
cd my-project-regression-test
pnpm install
pnpm exec playwright install chromium
pnpm regressionwright registry
pnpm regressionwright run --headed
```

The scaffold adds `@regressionwright/core` as a dev dependency and creates only project-level files. It does not copy `src/core`, generic scripts, or the generic runner into the consuming project.

`--reporter stagewright` adds `playwright-smart-reporter` and its local
Playwright configuration only to the consuming project. It does not add a
reporter dependency to `@regressionwright/core`. The generated configuration
keeps cloud upload and managed AI features disabled.

`--integration codex`, `--integration claude`, or `--integration all` installs
the package-owned skill into project-level folders only:

```text
.agents/skills/regressionwright/
.claude/skills/regressionwright/
```

## Runtime Boundary

The package separates two roots:

- `harnessPackageRoot`: package location, normally `node_modules/@regressionwright/core`.
- `consumerProjectRoot`: regression project location, discovered by walking upward to `config/harness.json`.

Package consumers can force the project root with:

```bash
E2E_REGRESSION_PROJECT_ROOT=/path/to/my-project-regression-test pnpm regressionwright run <pipeline-id>
```

## Module Contract

Every project module must register an adapter in `config/harness.json`:

```json
{
  "schemaVersion": 1,
  "defaultModule": "my-project",
  "modules": {
    "my-project": {
      "description": "My project regression module.",
      "adapterPath": "src/modules/my-project/harness-adapter.mjs"
    }
  }
}
```

Required adapter exports:

```js
export const defaultPipelineId = 'my-project-regression';
export const pipelineRunnerModule = 'tests/my-project/pipeline-runner.mjs';
export const playwrightSpecPath = 'tests/harness/pipeline-runner.spec.mjs';
```

Required module data generator:

```js
export function createRegressionInput(params) {}
```

The data generator composes selected stage inputs into `input.json`. Pipeline JSON must stay focused on stage composition.

The scaffold includes a local Playwright shim at `tests/harness/pipeline-runner.spec.mjs`:

```js
import '@regressionwright/core/tests/harness/pipeline-runner.spec.mjs';
```

Keep this shim local to the consuming project. Playwright may ignore specs that live directly inside `node_modules`, so the shim gives the project a normal local test entry while keeping the generic runner in the package.

## Publish Gate

Do not publish until these are true:

- one standalone consumer has been scaffolded and run;
- package name and release ownership are confirmed;
- `pnpm pack --dry-run` contains only generic package files;
- generated scaffold can run `pnpm regressionwright registry` and the starter pipeline after install.
