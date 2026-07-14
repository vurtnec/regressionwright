import { expect, test } from '@playwright/test';
import { createStageError } from '../../src/core/stage-error.mjs';

test.describe('stage error classification', () => {
  test('classifies an unavailable Appium server as an environment issue', () => {
    const error = createStageError(
      new Error('Unable to connect to "http://127.0.0.1:4723/", make sure browser driver is running on that address.'),
      { stageId: 'app-session/default' }
    );

    expect(error.code).toBe('ENVIRONMENT_ERROR');
    expect(error.category).toBe('env_issue');
  });

  test('classifies a missing mobile element as a selector issue', () => {
    const error = createStageError(
      new Error('no such element: accessibility id "home-title"'),
      { stageId: 'app-home/default' }
    );

    expect(error.code).toBe('SELECTOR_NOT_FOUND');
    expect(error.category).toBe('script_issue');
  });

  test('classifies a closed WeChat DevTools service port as an environment issue', () => {
    const error = createStageError(
      new Error('Failed to launch wechat web devTools, please make sure http port is open'),
      { stageId: 'mini-program-session/default' }
    );

    expect(error.code).toBe('ENVIRONMENT_ERROR');
    expect(error.category).toBe('env_issue');
  });
});
