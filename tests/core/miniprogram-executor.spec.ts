import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scaffoldScript = path.join(packageRoot, 'bin/create-regressionwright.mjs');
const cliScript = path.join(packageRoot, 'bin/regressionwright.mjs');

test('dispatches a Mini Program plan through the built-in project runner', () => {
  const projectRoot = createMiniProgramFixture();
  const output = execFileSync(process.execPath, [cliScript, 'run', 'demo-regression'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      E2E_REGRESSION_PROJECT_ROOT: projectRoot,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });

  expect(output).toContain('Executor: miniprogram');
  expect(output).toContain('Mini Program output:');
  const runRoot = path.join(projectRoot, 'artifacts/runs/demo-regression');
  const [runId] = fs.readdirSync(runRoot);
  const context = readJson(path.join(runRoot, runId, 'run-context.json'));
  expect(context.state.miniProgramSession.launched).toBe(true);
  expect(context.state.pageNavigation.pagePath).toBe('pages/settings/settings');
  expect(context.checkpoints).toHaveLength(2);
  expect(context.checkpoints.every((checkpoint: { status: string }) => checkpoint.status === 'passed'))
    .toBe(true);
});

function createMiniProgramFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'regressionwright-miniprogram-'));
  const projectRoot = path.join(tempRoot, 'demo-mini-program-regression');
  execFileSync(process.execPath, [
    scaffoldScript,
    projectRoot,
    '--module',
    'demo',
    '--executor',
    'miniprogram',
    '--core-package',
    'workspace:*',
  ], { stdio: 'pipe' });

  const packageLinkDir = path.join(projectRoot, 'node_modules/@regressionwright');
  fs.mkdirSync(packageLinkDir, { recursive: true });
  fs.symlinkSync(packageRoot, path.join(packageLinkDir, 'core'), 'dir');
  fs.writeFileSync(
    path.join(projectRoot, 'tests/demo/pipeline-runner.mjs'),
    fakePipelineRunnerSource(),
    'utf8'
  );
  return projectRoot;
}

function fakePipelineRunnerSource() {
  return `
import { readHarnessEnv } from '@regressionwright/core/env-vars.mjs';
import { readJson } from '@regressionwright/core/run-data.mjs';
import { saveRunContext } from '@regressionwright/core/run-context.mjs';
import { runStage } from '@regressionwright/core/stage.mjs';

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
        if (stage.id === 'launch-mini-program-default') {
          run.state.miniProgramSession = {
            launched: true,
            pagePath: 'pages/index/index',
            readySelector: '#home-title',
            readyElementVisible: true,
            readyText: 'RegressionWright Mini Program',
          };
        } else {
          run.state.pageNavigation = {
            completed: true,
            pagePath: 'pages/settings/settings',
            readyElementVisible: true,
            readyText: 'Settings',
          };
        }
      });
    },
  };
}
`;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
