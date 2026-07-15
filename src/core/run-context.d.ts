import type { RegressionPlan } from './run-data.mjs';
import type { StructuredStageError } from './stage-error.mjs';
export type StageCheckpoint = {
    stageId: string;
    status: 'passed' | 'failed';
    at: string;
    notes?: string;
    assertions?: {
        contract: {
            id: string;
            path?: string;
            status: 'passed';
        };
        checks?: {
            id: string;
            path?: string;
            status: 'passed';
        };
    };
    error?: StructuredStageError;
};
export type RunContextBase<TInput = unknown, TPlan extends RegressionPlan = RegressionPlan, TState extends Record<string, unknown> = Record<string, unknown>> = {
    pipelineId: string;
    envName: string;
    runId: string;
    startedAt: string;
    artifacts: {
        runDir: string;
    };
    plan: TPlan;
    input: TInput;
    state?: TState;
    checkpoints: StageCheckpoint[];
    resume?: {
        sourceRunId?: string;
        sourcePipelineId?: string;
        sourceContextPath?: string;
        startStageId?: string;
        startedAt?: string;
        [key: string]: unknown;
    };
};
export declare function saveRunContext(run: RunContextBase): Promise<void>;
export declare function createResumedRunContext<TRun extends RunContextBase>(defaultRun: TRun, options?: {
    resumeContextPath?: string;
    resumeStartStageId?: string;
}): Promise<TRun>;
export declare function addCheckpoint(run: RunContextBase, checkpoint: Omit<StageCheckpoint, 'at'>): Promise<void>;
export declare function contextPath(run: RunContextBase): string;
