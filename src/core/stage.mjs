import { addCheckpoint } from './run-context.mjs';
import { assertStageError, assertStageInput, assertStageOutput } from './schema.mjs';
import { createStageError } from './stage-error.mjs';

export async function runStage(run, stageId, fn, options = {}) {
  try {
    assertStageInput(run, stageId);
    await fn();
    const assertions = assertStageOutput(run, stageId);
    await addCheckpoint(run, { stageId, status: 'passed', assertions });
  } catch (error) {
    const stageError = createStageError(error, {
      stageId,
      run,
      evidence: await resolveEvidence(options.evidence),
    });
    assertStageError(run, stageId, stageError);
    await addCheckpoint(run, {
      stageId,
      status: 'failed',
      notes: stageError.message,
      error: stageError,
    });
    throw error;
  }
}

async function resolveEvidence(provider) {
  if (!provider) {
    return undefined;
  }

  try {
    return typeof provider === 'function' ? await provider() : provider;
  } catch (error) {
    return {
      evidenceCollectionError: error instanceof Error ? error.message : String(error),
    };
  }
}
