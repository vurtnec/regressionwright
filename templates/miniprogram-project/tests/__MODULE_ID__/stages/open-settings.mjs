import { inputForStage } from '@vurtnec_/regressionwright/stage-input.mjs';
import { assertElementText, normalizePagePath, waitForElement, waitForPagePath } from './mini-program-page.mjs';

export async function openSettingsStage({ connect, run, stage }) {
  const input = inputForStage(run, stage, 'pageNavigation');
  const miniProgram = await connect();
  const currentPage = await miniProgram.currentPage();
  if (!currentPage) {
    throw new Error('Mini Program connection has no current page.');
  }

  const trigger = await waitForElement(currentPage, input.clickSelector, input.timeoutMs);
  await trigger.tap();
  const targetPage = await waitForPagePath(miniProgram, input.expectedPath, input.timeoutMs);
  const readyElement = await waitForElement(targetPage, input.readySelector, input.timeoutMs);
  const readyText = await assertElementText(readyElement, input.expectedText, input.readySelector);

  run.state.pageNavigation = {
    completed: true,
    pagePath: normalizePagePath(targetPage.path),
    readyElementVisible: true,
    readyText,
  };
}
