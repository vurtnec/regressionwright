import fs from 'node:fs/promises';
import path from 'node:path';
import automator from 'miniprogram-automator';
import { readHarnessEnv } from '@regressionwright/core/env-vars.mjs';
import { readJson } from '@regressionwright/core/run-data.mjs';
import { createResumedRunContext, saveRunContext } from '@regressionwright/core/run-context.mjs';
import { runStage as runHarnessStage } from '@regressionwright/core/stage.mjs';
import { launchMiniProgramStage } from './stages/launch-mini-program.mjs';
import { openSettingsStage } from './stages/open-settings.mjs';

const executors = {
  'launch-mini-program-default': launchMiniProgramStage,
  'open-settings-default': openSettingsStage,
};

export async function createPipelineRunner() {
  const run = await createRunContext();
  let miniProgram;

  return {
    run,
    async runStage(stage) {
      const executor = executors[stage.id];
      if (!executor) {
        throw new Error(`No Mini Program stage executor registered for planned stage "${stage.id}".`);
      }

      await runHarnessStage(
        run,
        stage.refId || stage.id,
        async () => executor({ connect, run, stage }),
        { evidence: collectFailureEvidence }
      );
      await collectStageScreenshot(stage);
    },
    async close() {
      await miniProgram?.close();
    },
  };

  async function connect(input) {
    if (miniProgram) {
      return miniProgram;
    }
    if (!input?.launchOptions) {
      throw new Error('Mini Program connection is not initialized. Run a session stage first.');
    }
    miniProgram = await automator.launch(input.launchOptions);
    return miniProgram;
  }

  async function collectFailureEvidence() {
    const outputDir = miniProgramOutputDir();
    await fs.mkdir(outputDir, { recursive: true });
    const evidence = {
      runDir: run.artifacts.runDir,
      miniProgramOutputDir: outputDir,
    };
    if (!miniProgram) {
      return evidence;
    }

    try {
      const currentPage = await miniProgram.currentPage();
      evidence.pagePath = currentPage?.path;
      const screenshot = path.join(outputDir, 'stage-failed.png');
      await miniProgram.screenshot({ path: screenshot });
      evidence.screenshot = screenshot;
    } catch (error) {
      evidence.evidenceCollectionError = error instanceof Error ? error.message : String(error);
    }
    return evidence;
  }

  async function collectStageScreenshot(stage) {
    if (!miniProgram) {
      return;
    }
    const outputDir = miniProgramOutputDir();
    await fs.mkdir(outputDir, { recursive: true });
    const stageName = String(stage.refId || stage.id).replace(/[^A-Za-z0-9._-]/g, '-');
    try {
      await miniProgram.screenshot({ path: path.join(outputDir, `${stageName}.png`) });
    } catch (error) {
      console.warn(
        `Mini Program screenshot failed for ${stageName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  function miniProgramOutputDir() {
    return readHarnessEnv('MINIPROGRAM_OUTPUT_DIR') ||
      path.join(run.artifacts.runDir, 'miniprogram');
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
