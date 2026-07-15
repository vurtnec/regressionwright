import { inputForStage } from '@vurtnec_/regressionwright/stage-input.mjs';

export async function healthCheckStage({ page, run, stage, performance }) {
  const input = inputForStage(run, stage, 'healthCheck');

  await performance.measureInitialRender(stage, 'open example home page', async () => {
    await page.goto(input.baseUrl, { waitUntil: 'domcontentloaded' });
  });

  const title = await page.title();
  if (!title.includes(input.expectedTitleContains)) {
    throw new Error(
      `Expected page title to contain "${input.expectedTitleContains}", but got "${title}".`
    );
  }

  run.state.healthCheck = {
    checked: true,
    title,
    url: page.url(),
  };
}
