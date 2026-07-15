import type { Page, TestInfo } from '@playwright/test';
import type { RunContextBase } from './run-context.js';
import type { StageErrorEvidence } from './stage-error.mjs';
export declare function attachScreenshot(params: {
    page: Page;
    testInfo: TestInfo;
    run: RunContextBase;
    name: string;
    fullPage?: boolean;
}): Promise<string>;
export declare function createPlaywrightFailureEvidence(params: {
    page: Page;
    testInfo: TestInfo;
    run: RunContextBase;
}): StageErrorEvidence;
