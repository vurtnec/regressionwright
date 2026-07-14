export function createStageError(error, params = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const code = classifyErrorCode(message, error);

  return {
    code,
    category: categoryForCode(code),
    message,
    stageId: params.stageId,
    evidence: {
      runDir: params.run?.artifacts?.runDir,
      ...params.evidence,
    },
    originalName: error instanceof Error ? error.name : undefined,
    stack: error instanceof Error ? error.stack : undefined,
  };
}

export function categoryForCode(code) {
  switch (code) {
    case 'AUTH_REQUIRED':
    case 'ENVIRONMENT_ERROR':
      return 'env_issue';
    case 'PRECONDITION_FAILED':
      return 'planning_error';
    case 'SELECTOR_NOT_FOUND':
    case 'VALIDATION_ERROR':
    case 'TIMEOUT':
      return 'script_issue';
    case 'APP_ERROR':
      return 'app_bug';
    default:
      return 'unknown';
  }
}

function classifyErrorCode(message, error) {
  if (/SSO|auth|login|microsoftonline|AUTH/i.test(message)) {
    return 'AUTH_REQUIRED';
  }

  if (/missing required prior outputs|requires run\.[\w.]+|not present in the current plan|PRECONDITION/i.test(message)) {
    return 'PRECONDITION_FAILED';
  }

  if (/Schema validation failed|VALIDATION_ERROR/i.test(message)) {
    return 'VALIDATION_ERROR';
  }

  if (/ENVIRONMENT_ERROR|Executable doesn't exist|playwright install|browserType\.launch|Appium server|Unable to connect|browser driver is running|service failed to start|ECONNREFUSED|XCUITest|WebDriverAgent|session not created|Wechat web devTools|automation enabled|mini.?program connection|static assets|\/assets\/.*\.js|chunk|CDN/i.test(message)) {
    return 'ENVIRONMENT_ERROR';
  }

  if (/APP_ERROR|application error|business error|save failed|confirm failed|notification error/i.test(message)) {
    return 'APP_ERROR';
  }

  if (/locator|selector|accessibility id|no such element|element not found|toBeVisible|Cannot find visible|waiting for|getByRole|strict mode violation/i.test(message)) {
    return 'SELECTOR_NOT_FOUND';
  }

  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'TIMEOUT';
  }

  if (/Timeout|timed out/i.test(message)) {
    return 'TIMEOUT';
  }

  return 'UNKNOWN';
}
