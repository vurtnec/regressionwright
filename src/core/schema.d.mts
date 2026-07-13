import type { RunContextBase } from './run-context.js';
import type { RegressionPlan } from './run-data.mjs';

export function validateJsonSchema(schema: Record<string, unknown>, value: unknown, path?: string): string[];
export function assertJsonSchema(schema: Record<string, unknown>, value: unknown, label: string): void;
export function assertPlanInput(plan: RegressionPlan, input: unknown): void;
export function assertStageInput(run: RunContextBase, stageId: string): void;
export function assertStageOutput(run: RunContextBase, stageId: string): {
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
export function assertStageError(run: RunContextBase, stageId: string, error: unknown): void;
