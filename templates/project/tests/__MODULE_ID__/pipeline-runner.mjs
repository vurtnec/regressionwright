import path from 'node:path';
import { createPlaywrightFailureEvidence } from '@vurtnec_/regressionwright/evidence.mjs';
import { createPerformanceMonitor } from '@vurtnec_/regressionwright/performance-monitor.mjs';
import { readHarnessEnv } from '@vurtnec_/regressionwright/env-vars.mjs';
import { readJson } from '@vurtnec_/regressionwright/run-data.mjs';
import { createResumedRunContext, saveRunContext } from '@vurtnec_/regressionwright/run-context.mjs';
import { runStage as runHarnessStage } from '@vurtnec_/regressionwright/stage.mjs';
import { healthCheckStage } from './stages/health-check.mjs';
import { contentCheckStage } from './stages/content-check.mjs';
import { summaryCheckStage } from './stages/summary-check.mjs';

const executors = {
  'health-check-default': healthCheckStage,
  'content-check-default': contentCheckStage,
  'content-check-strict': contentCheckStage,
  'summary-check-default': summaryCheckStage,
};

export async function createPipelineRunner({ browser, testInfo }) {
  const run = await createRunContext();
  const context = await browser.newContext();
  const page = await context.newPage();
  const performance = await createPerformanceMonitor({ page, run, testInfo });

  return {
    run,
    async runStage(stage) {
      const executor = executors[stage.id];
      if (!executor) {
        throw new Error(`No stage executor registered for planned stage "${stage.id}".`);
      }

      await runHarnessStage(
        run,
        stage.refId || stage.id,
        async () => executor({ page, run, stage, performance }),
        {
          evidence: () => createPlaywrightFailureEvidence({ page, testInfo, run }),
        }
      );
    },
    async close() {
      try {
        await performance.writeReport();
      } finally {
        await context.close();
      }
    },
  };
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
    artifacts: {
      runDir,
    },
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
