import { inputForStage } from '@regressionwright/core/stage-input.mjs';

export async function summaryCheckStage({ run, stage }) {
  const input = inputForStage(run, stage);
  const contentChecks = run.state.contentChecks || {};
  const passedCount = Object.values(contentChecks).filter(result => result?.checked === true).length;

  if (passedCount < 2) {
    throw new Error(`Expected at least 2 content checks to pass, got ${passedCount}.`);
  }

  run.state.summaryCheck = {
    checked: true,
    siteUrl: input.healthCheck.baseUrl,
    contentChecksPassed: passedCount,
  };
}
