export const defaultPipelineId = '__MODULE_ID__-regression';
export const pipelineRunnerModule = 'tests/__MODULE_ID__/pipeline-runner.mjs';
export const playwrightSpecPath = 'tests/harness/pipeline-runner.spec.mjs';

export function createRuntimeInput({ options }) {
  return {
    site: options.site || 'default',
  };
}

export function validateRunOptions({ projectOptions }) {
  if (projectOptions.site !== undefined && typeof projectOptions.site !== 'string') {
    throw new Error('--site must be a site id string.');
  }
}
