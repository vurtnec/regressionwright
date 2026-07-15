import type { RunContextBase } from './run-context.js';
import type { RegressionPlan } from './run-data.mjs';
type PlannedStage = RegressionPlan['stages'][number];
export type StageInputEntry<TValue = unknown> = {
    stage: string;
    dataKey?: string;
    dataKeys?: string[];
    variant?: string;
    actor?: string;
    input?: string;
    dates?: string;
    checks?: string;
    value: TValue;
};
export declare function inputForStage<TValue>(run: RunContextBase<unknown, RegressionPlan>, stage: PlannedStage | undefined, fallbackDataKey?: string): TValue;
export {};
