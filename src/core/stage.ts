import { addCheckpoint, type RunContextBase } from './run-context.js';
import { assertStageError, assertStageInput, assertStageOutput } from './schema.mjs';
import { createStageError, type StageErrorEvidence } from './stage-error.mjs';

type StageEvidenceProvider = StageErrorEvidence | (() => StageErrorEvidence | Promise<StageErrorEvidence>);

export async function runStage(
  run: RunContextBase,
  stageId: string,
  fn: () => Promise<void>,
  options: {
    evidence?: StageEvidenceProvider;
  } = {}
) {
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

async function resolveEvidence(provider?: StageEvidenceProvider): Promise<StageErrorEvidence | undefined> {
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
