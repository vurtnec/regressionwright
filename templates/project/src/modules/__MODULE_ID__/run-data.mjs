import {
  collectStageInputRefs,
  deepMerge,
  loadStageDataDefaults,
} from '@regressionwright/core/run-data.mjs';

export function createRegressionInput(params) {
  const stageDefaults = loadStageDataDefaults(params.pipeline, params.stageIds, {
    dataProfile: params.env.dataProfile,
  });
  const envConfig = params.env['__MODULE_ID__'] || {};
  const siteId = params.runtimeInput?.site || envConfig.defaultSite || 'default';
  const siteConfig = envConfig.sites?.[siteId];
  if (!siteConfig) {
    throw new Error(
      `Unknown site "${siteId}" for env "${params.envName}". Configure it under config/${params.envName}.json at __MODULE_ID__.sites.${siteId}.`
    );
  }
  const envDefaults = {
    healthCheck: {
      baseUrl: siteConfig.baseUrl,
      expectedTitleContains: siteConfig.expectedTitleContains,
    },
  };
  const input = deepMerge(stageDefaults, envDefaults);

  return {
    schemaVersion: 1,
    module: '__MODULE_ID__',
    data: {
      generator: 'module-data-generator',
      generatedAt: new Date().toISOString(),
      dataProfile: params.env.dataProfile,
      site: siteId,
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
        dates: ref.dates,
        checks: ref.checks,
        value: stageInputValue(input, ref),
      },
    ])
  );
}

function stageInputValue(input, ref) {
  if (ref.dataKeys?.length > 1) {
    return Object.fromEntries(ref.dataKeys.map(dataKey => [dataKey, input[dataKey] || {}]));
  }
  return input[ref.dataKey] || {};
}
