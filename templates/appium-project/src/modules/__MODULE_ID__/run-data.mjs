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
  if (!envConfig.appium?.capabilities) {
    throw new Error(`Missing Appium configuration at config/${params.envName}.json -> __MODULE_ID__.appium.`);
  }

  const input = deepMerge(stageDefaults, {
    appSession: {
      server: {
        protocol: envConfig.appium.protocol || 'http',
        hostname: envConfig.appium.hostname || '127.0.0.1',
        port: envConfig.appium.port || 4723,
        path: envConfig.appium.path || '/',
        logLevel: envConfig.appium.logLevel || 'info',
      },
      capabilities: envConfig.appium.capabilities,
    },
  });

  return {
    schemaVersion: 1,
    module: '__MODULE_ID__',
    data: {
      generator: 'module-data-generator',
      generatedAt: new Date().toISOString(),
      dataProfile: params.env.dataProfile,
      executor: 'appium',
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
