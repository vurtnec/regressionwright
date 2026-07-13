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

export function inputForStage<TValue>(
  run: RunContextBase<unknown, RegressionPlan>,
  stage: PlannedStage | undefined,
  fallbackDataKey?: string
): TValue {
  const input = run.input as {
    stageInputs?: Record<string, StageInputEntry<TValue>>;
    [key: string]: unknown;
  };
  const refId = stage?.refId || stage?.id;
  const stageInput = refId ? input.stageInputs?.[refId] : undefined;
  if (stageInput?.value !== undefined) {
    if (
      fallbackDataKey &&
      stageInput.value &&
      typeof stageInput.value === 'object' &&
      !Array.isArray(stageInput.value) &&
      Object.prototype.hasOwnProperty.call(stageInput.value, fallbackDataKey)
    ) {
      return (stageInput.value as Record<string, TValue>)[fallbackDataKey];
    }

    return stageInput.value;
  }

  const dataKey = stage?.registry?.dataKey || fallbackDataKey;
  if (dataKey && input[dataKey] !== undefined) {
    return input[dataKey] as TValue;
  }

  throw new Error(
    `Missing stage input${refId ? ` for "${refId}"` : ''}${dataKey ? ` at input.${dataKey}` : ''}.`
  );
}
