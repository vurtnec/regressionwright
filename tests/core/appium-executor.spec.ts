import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scaffoldScript = path.join(packageRoot, 'bin/create-regressionwright.mjs');
const cliScript = path.join(packageRoot, 'bin/regressionwright.mjs');

test('dispatches an Appium plan through the built-in Appium runner', () => {
  const projectRoot = createAppiumFixture();
  const output = execFileSync(process.execPath, [cliScript, 'run', 'demo-regression'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      E2E_REGRESSION_PROJECT_ROOT: projectRoot,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });

  expect(output).toContain('Executor: appium');
  expect(output).toContain('Appium output:');
  const runRoot = path.join(projectRoot, 'artifacts/runs/demo-regression');
  const [runId] = fs.readdirSync(runRoot);
  const context = readJson(path.join(runRoot, runId, 'run-context.json'));
  expect(context.state.appSession.launched).toBe(true);
  expect(context.checkpoints).toHaveLength(1);
  expect(context.checkpoints[0].status).toBe('passed');
});

function createAppiumFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'regressionwright-appium-'));
  const projectRoot = path.join(tempRoot, 'demo-app-regression');
  execFileSync(process.execPath, [
    scaffoldScript,
    projectRoot,
    '--module',
    'demo',
    '--executor',
    'appium',
    '--core-package',
    'workspace:*',
  ], { stdio: 'pipe' });

  const packageLinkDir = path.join(projectRoot, 'node_modules/@vurtnec_');
  fs.mkdirSync(packageLinkDir, { recursive: true });
  fs.symlinkSync(packageRoot, path.join(packageLinkDir, 'regressionwright'), 'dir');
  fs.writeFileSync(
    path.join(projectRoot, 'tests/demo/pipeline-runner.mjs'),
    fakePipelineRunnerSource(),
    'utf8'
  );
  return projectRoot;
}

function fakePipelineRunnerSource() {
  return `
import path from 'node:path';
import { readHarnessEnv } from '@vurtnec_/regressionwright/env-vars.mjs';
import { readJson } from '@vurtnec_/regressionwright/run-data.mjs';
import { saveRunContext } from '@vurtnec_/regressionwright/run-context.mjs';
import { runStage } from '@vurtnec_/regressionwright/stage.mjs';

export async function createPipelineRunner() {
  const runDir = readHarnessEnv('RUN_DIR');
  const plan = readJson(readHarnessEnv('PLAN_PATH'));
  const input = readJson(readHarnessEnv('INPUT_PATH'));
  const run = {
    pipelineId: plan.pipelineId,
    envName: plan.envName,
    runId: plan.runId,
    startedAt: new Date().toISOString(),
    artifacts: { runDir },
    plan,
    input,
    state: {},
    checkpoints: [],
  };
  await saveRunContext(run);
  return {
    run,
    async runStage(stage) {
      await runStage(run, stage.refId || stage.id, async () => {
        run.state.appSession = {
          launched: true,
          sessionId: 'fixture-session',
          platformName: 'iOS',
          automationName: 'XCUITest',
          readyElementVisible: false,
        };
      });
    },
  };
}
`;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
