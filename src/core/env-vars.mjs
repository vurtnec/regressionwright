const GENERIC_PREFIX = 'E2E_REGRESSION_';

export function harnessEnvKey(name) {
  return `${GENERIC_PREFIX}${name}`;
}

export function readHarnessEnv(name, defaultValue) {
  return process.env[harnessEnvKey(name)] ?? defaultValue;
}

export function readHarnessEnvNumber(name, defaultValue) {
  const value = readHarnessEnv(name);
  return value === undefined ? defaultValue : Number(value);
}

export function readHarnessEnvList(name) {
  return readHarnessEnv(name)
    ?.split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

export function setHarnessEnv(envVars, name, value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const stringValue = String(value);
  envVars[harnessEnvKey(name)] = stringValue;
  return stringValue;
}

export function syncHarnessEnv(envVars, name, defaultValue) {
  return setHarnessEnv(envVars, name, envVars[harnessEnvKey(name)] ?? defaultValue);
}
