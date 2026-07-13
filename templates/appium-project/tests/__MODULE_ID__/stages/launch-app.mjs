import { inputForStage } from '@regressionwright/core/stage-input.mjs';

export async function launchAppStage({ connect, run, stage }) {
  const input = inputForStage(run, stage, 'appSession');
  const driver = await connect(input);
  let readyElementVisible = false;

  if (input.readyAccessibilityId) {
    const readyElement = await driver.$(`~${input.readyAccessibilityId}`);
    await readyElement.waitForDisplayed({ timeout: input.readyTimeoutMs });
    readyElementVisible = true;
  }

  run.state.appSession = {
    launched: true,
    sessionId: driver.sessionId,
    platformName: String(driver.capabilities.platformName || 'iOS'),
    automationName: String(driver.capabilities['appium:automationName'] || 'XCUITest'),
    readyElementVisible,
  };
}
