import { inputForStage } from '@vurtnec_/regressionwright/stage-input.mjs';
import { assertElementText, normalizePagePath, waitForElement } from './mini-program-page.mjs';

export async function launchMiniProgramStage({ connect, run, stage }) {
  const input = inputForStage(run, stage, 'miniProgramSession');
  const miniProgram = await connect(input);
  const page = await miniProgram.reLaunch(input.initialPath);
  if (!page) {
    throw new Error(`Mini Program failed to open initial route: ${input.initialPath}`);
  }

  const readyElement = await waitForElement(page, input.readySelector, input.readyTimeoutMs);
  const readyText = await assertElementText(readyElement, input.expectedText, input.readySelector);

  run.state.miniProgramSession = {
    launched: true,
    pagePath: normalizePagePath(page.path),
    readySelector: input.readySelector,
    readyElementVisible: true,
    readyText,
  };
}
