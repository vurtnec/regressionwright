import { pathToFileURL } from 'node:url';
import { defaultModuleId, loadProjectHarnessAdapter } from '../src/core/project-adapter.mjs';
import { resolveFromProjectRoot } from '../src/core/run-data.mjs';

export async function runProjectPipeline(executorType) {
  const moduleId = defaultModuleId();
  const adapter = await loadProjectHarnessAdapter(moduleId);
  if (adapter.executorType && adapter.executorType !== executorType) {
    throw new Error(
      `${executorLabel(executorType)} runner cannot execute adapter type "${adapter.executorType}".`
    );
  }

  const runnerModule = await loadPipelineRunnerModule(adapter.pipelineRunnerModule, executorType);
  const runner = await runnerModule.createPipelineRunner({ executorType });
  if (!runner?.run?.plan?.stages || typeof runner.runStage !== 'function') {
    throw new Error(
      `${executorLabel(executorType)} pipeline runner must return { run, runStage, close? }.`
    );
  }

  try {
    for (const [index, plannedStage] of runner.run.plan.stages.entries()) {
      console.log(
        `[${index + 1}/${runner.run.plan.stages.length}] ${stepTitle(runnerModule, index, plannedStage)}`
      );
      await runner.runStage(plannedStage);
    }
  } finally {
    await runner.close?.();
  }
}

async function loadPipelineRunnerModule(modulePath, executorType) {
  if (!modulePath) {
    throw new Error(
      `The selected ${executorLabel(executorType)} module does not define pipelineRunnerModule in harness-adapter.mjs.`
    );
  }

  const moduleUrl = pathToFileURL(resolveFromProjectRoot(modulePath)).href;
  const module = await import(moduleUrl);
  if (typeof module.createPipelineRunner !== 'function') {
    throw new Error(`Pipeline runner module "${modulePath}" must export createPipelineRunner(params).`);
  }
  return module;
}

function executorLabel(executorType) {
  return executorType === 'miniprogram' ? 'Mini Program' : 'Appium';
}

function stepTitle(module, index, stage) {
  return module.stageStepTitle?.(index, stage) ||
    `${String(index + 1).padStart(2, '0')} ${stage.name || stage.id}`;
}
