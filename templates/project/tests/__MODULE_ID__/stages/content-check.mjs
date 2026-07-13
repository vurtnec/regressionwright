import { inputForStage } from '@regressionwright/core/stage-input.mjs';

export async function contentCheckStage({ page, run, stage, performance }) {
  const input = inputForStage(run, stage);
  const variant = stage.registry?.variant || 'default';

  const result = variant === 'strict'
    ? await clickLearnMoreAndVerifyDestination({ page, input, stage, performance })
    : await verifyExampleDomainHome({ page, input });

  run.state.contentChecks = {
    ...(run.state.contentChecks || {}),
    [variant]: result,
  };
}

async function verifyExampleDomainHome({ page, input }) {
  await expectBodyText(page, input.expectedText);
  await expectHeading(page, input.expectedHeading);
  await expectLink(page, input.expectedLinkText);

  return {
    checked: true,
    matchedText: input.expectedText,
    matchedHeading: input.expectedHeading,
    matchedLinkText: input.expectedLinkText,
    title: await page.title(),
    url: page.url(),
  };
}

async function clickLearnMoreAndVerifyDestination({ page, input, stage, performance }) {
  const link = await expectLink(page, input.expectedLinkText);
  await performance.measureAction(stage, 'click Learn more link and wait for destination', async () => {
    await Promise.all([
      page.waitForURL(url => url.href.includes(input.expectedDestinationUrlContains), {
        timeout: 15_000,
        waitUntil: 'domcontentloaded',
      }),
      link.click(),
    ]);
  });

  const title = await page.title();
  if (!title.includes(input.expectedDestinationTitleContains)) {
    throw new Error(
      `Expected destination title to contain "${input.expectedDestinationTitleContains}", but got "${title}".`
    );
  }

  await expectHeading(page, input.expectedDestinationHeading);
  await expectBodyText(page, input.expectedDestinationBodyText);

  const navLinksMatched = [];
  for (const linkText of input.expectedNavLinks || []) {
    await expectLink(page, linkText, { exact: true });
    navLinksMatched.push(linkText);
  }

  return {
    checked: true,
    clickedLinkText: input.expectedLinkText,
    destinationUrl: page.url(),
    destinationTitle: title,
    destinationHeading: input.expectedDestinationHeading,
    destinationTextMatched: input.expectedDestinationBodyText,
    navLinksMatched,
  };
}

async function expectBodyText(page, expectedText) {
  const bodyText = await page.locator('body').innerText();
  if (!bodyText.includes(expectedText)) {
    throw new Error(`Expected body text to contain "${expectedText}".`);
  }
}

async function expectHeading(page, expectedHeading) {
  const heading = page.getByRole('heading', { name: expectedHeading });
  await heading.waitFor({ state: 'visible', timeout: 10_000 });
  return heading;
}

async function expectLink(page, expectedLinkText, options = {}) {
  const link = page.getByRole('link', { name: expectedLinkText, exact: options.exact ?? false }).first();
  await link.waitFor({ state: 'visible', timeout: 10_000 });
  const actualText = await link.innerText();
  if (!actualText.includes(expectedLinkText)) {
    throw new Error(`Expected link text to contain "${expectedLinkText}", but got "${actualText}".`);
  }
  return link;
}
