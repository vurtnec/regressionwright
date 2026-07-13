import type { Page, TestInfo } from '@playwright/test';
import path from 'node:path';
import type { RunContextBase } from './run-context.js';
import type { StageErrorEvidence } from './stage-error.mjs';

export async function attachScreenshot(params: {
  page: Page;
  testInfo: TestInfo;
  run: RunContextBase;
  name: string;
  fullPage?: boolean;
}) {
  const filename = `${params.name}.png`;
  const filePath = path.join(params.run.artifacts.runDir, filename);
  await params.page.screenshot({ path: filePath, fullPage: params.fullPage ?? true });
  await params.testInfo.attach(params.name, {
    path: filePath,
    contentType: 'image/png',
  });
  return filePath;
}

export function createPlaywrightFailureEvidence(params: {
  page: Page;
  testInfo: TestInfo;
  run: RunContextBase;
}): StageErrorEvidence {
  return {
    runDir: params.run.artifacts.runDir,
    playwrightOutputDir: params.testInfo.outputDir,
    screenshot: path.join(params.testInfo.outputDir, 'test-failed-1.png'),
    trace: path.join(params.testInfo.outputDir, 'trace.zip'),
    video: path.join(params.testInfo.outputDir, 'video.webm'),
    url: params.page.url(),
  };
}
