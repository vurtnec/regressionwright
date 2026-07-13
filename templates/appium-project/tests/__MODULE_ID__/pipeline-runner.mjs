import fs from 'node:fs/promises';
import path from 'node:path';
import { remote } from 'webdriverio';
import { readHarnessEnv } from '@regressionwright/core/env-vars.mjs';
import { readJson } from '@regressionwright/core/run-data.mjs';
import { createResumedRunContext, saveRunContext } from '@regressionwright/core/run-context.mjs';
import { runStage as runHarnessStage } from '@regressionwright/core/stage.mjs';
import { launchAppStage } from './stages/launch-app.mjs';

const executors = {
  'launch-app-default': launchAppStage,
};

export async function createPipelineRunner() {
  const run = await createRunContext();
  let driver;

  return {
    run,
    async runStage(stage) {
      const executor = executors[stage.id];
      if (!executor) {
        throw new Error(`No Appium stage executor registered for planned stage "${stage.id}".`);
      }

      await runHarnessStage(
        run,
        stage.refId || stage.id,
        async () => executor({ connect, run, stage }),
        { evidence: collectFailureEvidence }
      );
    },
    async close() {
      await driver?.deleteSession();
    },
  };

  async function connect(input) {
    if (driver) {
      return driver;
    }
    const { server, capabilities } = input;
    driver = await remote({
      protocol: server.protocol || 'http',
      hostname: server.hostname,
      port: Number(server.port),
      path: server.path,
      logLevel: server.logLevel || 'info',
      capabilities,
    });
    return driver;
  }

  async function collectFailureEvidence() {
    const outputDir = readHarnessEnv('APPIUM_OUTPUT_DIR') || path.join(run.artifacts.runDir, 'appium');
    await fs.mkdir(outputDir, { recursive: true });
    const evidence = {
      runDir: run.artifacts.runDir,
      appiumOutputDir: outputDir,
      sessionId: driver?.sessionId,
    };
    if (driver?.sessionId) {
      const screenshot = path.join(outputDir, 'stage-failed.png');
      await driver.saveScreenshot(screenshot);
      evidence.screenshot = screenshot;
    }
    return evidence;
  }
}

export function stageStepTitle(index, stage) {
  return `${String(index + 1).padStart(2, '0')} ${stage.name || stage.id}`;
}

async function createRunContext() {
  const runDir = readHarnessEnv('RUN_DIR');
  const planPath = readHarnessEnv('PLAN_PATH') || path.join(runDir, 'plan.json');
  const inputPath = readHarnessEnv('INPUT_PATH') || path.join(runDir, 'input.json');
  const plan = readJson(planPath);
  const input = readJson(inputPath);
  const defaultRun = {
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
  const run = await createResumedRunContext(defaultRun, {
    resumeContextPath: readHarnessEnv('RESUME_CONTEXT_PATH'),
    resumeStartStageId: readHarnessEnv('RESUME_START_STAGE'),
  });
  await saveRunContext(run);
  return run;
}
