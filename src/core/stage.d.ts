import { type RunContextBase } from './run-context.js';
import { type StageErrorEvidence } from './stage-error.mjs';
type StageEvidenceProvider = StageErrorEvidence | (() => StageErrorEvidence | Promise<StageErrorEvidence>);
export declare function runStage(run: RunContextBase, stageId: string, fn: () => Promise<void>, options?: {
    evidence?: StageEvidenceProvider;
}): Promise<void>;
export {};
