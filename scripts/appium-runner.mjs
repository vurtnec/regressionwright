import { pathToFileURL } from 'node:url';
import { defaultModuleId, loadProjectHarnessAdapter } from '../src/core/project-adapter.mjs';
import { resolveFromProjectRoot } from '../src/core/run-data.mjs';

await main();

async function main() {
  const moduleId = defaultModuleId();
  const adapter = await loadProjectHarnessAdapter(moduleId);
  if (adapter.executorType && adapter.executorType !== 'appium') {
    throw new Error(`Appium runner cannot execute adapter type "${adapter.executorType}".`);
  }

  const runnerModule = await loadPipelineRunnerModule(adapter.pipelineRunnerModule);
  const runner = await runnerModule.createPipelineRunner({ executorType: 'appium' });
  if (!runner?.run?.plan?.stages || typeof runner.runStage !== 'function') {
    throw new Error('Appium pipeline runner must return { run, runStage, close? }.');
  }

  try {
    for (const [index, plannedStage] of runner.run.plan.stages.entries()) {
      console.log(`[${index + 1}/${runner.run.plan.stages.length}] ${stepTitle(runnerModule, index, plannedStage)}`);
      await runner.runStage(plannedStage);
    }
  } finally {
    await runner.close?.();
  }
}

async function loadPipelineRunnerModule(modulePath) {
  if (!modulePath) {
    throw new Error('The selected Appium module does not define pipelineRunnerModule in harness-adapter.mjs.');
  }

  const moduleUrl = pathToFileURL(resolveFromProjectRoot(modulePath)).href;
  const module = await import(moduleUrl);
  if (typeof module.createPipelineRunner !== 'function') {
    throw new Error(`Pipeline runner module "${modulePath}" must export createPipelineRunner(params).`);
  }
  return module;
}

function stepTitle(module, index, stage) {
  return module.stageStepTitle?.(index, stage) || `${String(index + 1).padStart(2, '0')} ${stage.name || stage.id}`;
}
