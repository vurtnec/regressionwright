import { test, type Browser, type TestInfo } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { defaultModuleId, loadProjectHarnessAdapter } from '../../src/core/project-adapter.mjs';
import { resolveFromProjectRoot } from '../../src/core/run-data.mjs';

type PlannedStage = {
  id: string;
  name?: string;
};

type PipelineRunner = {
  run: {
    pipelineId: string;
    runId: string;
    plan: {
      stages: PlannedStage[];
    };
  };
  runStage(stage: PlannedStage): Promise<void>;
  close?(): Promise<void>;
};

type PipelineRunnerModule = {
  createPipelineRunner(params: {
    browser: Browser;
    testInfo: TestInfo;
  }): Promise<PipelineRunner>;
  stageStepTitle?(index: number, stage: PlannedStage): string;
};

test.describe('regression pipeline', () => {
  test('run planned pipeline', async ({ browser }, testInfo) => {
    const moduleId = defaultModuleId();
    const adapter = await loadProjectHarnessAdapter(moduleId);
    const runnerModule = await loadPipelineRunnerModule(adapter.pipelineRunnerModule);
    const runner = await runnerModule.createPipelineRunner({ browser, testInfo });

    testInfo.annotations.push({ type: 'module', description: moduleId });
    testInfo.annotations.push({ type: 'pipeline', description: runner.run.pipelineId });
    testInfo.annotations.push({ type: 'runId', description: runner.run.runId });

    try {
      for (const [index, plannedStage] of runner.run.plan.stages.entries()) {
        await test.step(stepTitle(runnerModule, index, plannedStage), async () => {
          await runner.runStage(plannedStage);
        });
      }
    } finally {
      await runner.close?.();
    }
  });
});

async function loadPipelineRunnerModule(modulePath?: string): Promise<PipelineRunnerModule> {
  if (!modulePath) {
    throw new Error('The selected module does not define pipelineRunnerModule in harness-adapter.mjs.');
  }

  const moduleUrl = pathToFileURL(resolveFromProjectRoot(modulePath)).href;
  const module = await import(moduleUrl) as PipelineRunnerModule;
  if (typeof module.createPipelineRunner !== 'function') {
    throw new Error(`Pipeline runner module "${modulePath}" must export createPipelineRunner(params).`);
  }
  return module;
}

function stepTitle(module: PipelineRunnerModule, index: number, stage: PlannedStage) {
  return module.stageStepTitle?.(index, stage) || `${String(index + 1).padStart(2, '0')} ${stage.name || stage.id}`;
}
