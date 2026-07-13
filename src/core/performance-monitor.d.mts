import type { Page, TestInfo } from '@playwright/test';
import type { RunContextBase } from './run-context.js';
import type { RegressionPlan } from './run-data.mjs';

export type PerformanceMeasurementKind = 'initial-render' | 'action';

export type PerformanceMonitor = {
  measureInitialRender<TResult>(
    stage: RegressionPlan['stages'][number] | undefined,
    name: string,
    operation: () => Promise<TResult>
  ): Promise<TResult>;
  /**
   * Compatibility alias. Route changes are reported as action windows in the
   * first production report format.
   */
  measureRouteChange<TResult>(
    stage: RegressionPlan['stages'][number] | undefined,
    name: string,
    operation: () => Promise<TResult>
  ): Promise<TResult>;
  measureAction<TResult>(
    stage: RegressionPlan['stages'][number] | undefined,
    name: string,
    operation: () => Promise<TResult>
  ): Promise<TResult>;
  writeReport(options?: { attach?: boolean }): Promise<{
    jsonPath: string;
    summaryPath: string;
    report: unknown;
  }>;
};

export function createPerformanceMonitor(params: {
  page: Page;
  run: RunContextBase;
  testInfo?: TestInfo;
  slowRequestMs?: number;
  apiUrlPatterns?: Array<string | RegExp>;
}): Promise<PerformanceMonitor>;
