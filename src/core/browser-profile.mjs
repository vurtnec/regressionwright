import { readHarnessEnv } from './env-vars.mjs';

export function fixedProfileLaunchOptions(headless = false) {
  const channel = readHarnessEnv('BROWSER_CHANNEL', 'chrome');
  return {
    channel,
    headless,
    viewport: { width: 1440, height: 900 },
    screen: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'Asia/Hong_Kong',
    args: [
      '--window-position=80,40',
      '--window-size=1440,1000',
      '--force-device-scale-factor=1',
      '--high-dpi-support=1',
    ],
  };
}
