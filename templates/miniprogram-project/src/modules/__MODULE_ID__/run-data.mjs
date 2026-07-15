import path from 'node:path';
import {
  collectStageInputRefs,
  deepMerge,
  loadStageDataDefaults,
} from '@vurtnec_/regressionwright/run-data.mjs';

export function createRegressionInput(params) {
  const stageDefaults = loadStageDataDefaults(params.pipeline, params.stageIds, {
    dataProfile: params.env.dataProfile,
  });
  const envConfig = params.env['__MODULE_ID__'] || {};
  const miniProgramConfig = envConfig.miniprogram;
  if (!miniProgramConfig?.projectPath && !process.env.MINIPROGRAM_PROJECT_PATH) {
    throw new Error(
      `Missing Mini Program projectPath at config/${params.envName}.json -> __MODULE_ID__.miniprogram.`
    );
  }

  const projectPath = process.env.MINIPROGRAM_PROJECT_PATH || miniProgramConfig?.projectPath;
  const cliPath = process.env.WECHAT_DEVTOOLS_CLI || miniProgramConfig?.cliPath;
  const launchOptions = {
    projectPath: path.resolve(projectPath),
    timeout: miniProgramConfig?.launchTimeoutMs || 60000,
    trustProject: miniProgramConfig?.trustProject !== false,
  };
  if (cliPath) {
    launchOptions.cliPath = path.resolve(cliPath);
  }
  if (miniProgramConfig?.port) {
    launchOptions.port = miniProgramConfig.port;
  }

  const input = deepMerge(stageDefaults, {
    miniProgramSession: { launchOptions },
  });

  return {
    schemaVersion: 1,
    module: '__MODULE_ID__',
    data: {
      generator: 'module-data-generator',
      generatedAt: new Date().toISOString(),
      dataProfile: params.env.dataProfile,
      executor: 'miniprogram',
    },
    ...input,
    stageInputs: createStageInputs(params.pipeline, params.stageIds, input),
  };
}

function createStageInputs(pipeline, stageIds, input) {
  return Object.fromEntries(
    collectStageInputRefs(pipeline, stageIds).map(ref => [
      ref.refId,
      {
        stage: ref.stage,
        dataKey: ref.dataKey,
        dataKeys: ref.dataKeys,
        variant: ref.variant,
        actor: ref.actor,
        input: ref.input,
        checks: ref.checks,
        value: input[ref.dataKey] || {},
      },
    ])
  );
}
