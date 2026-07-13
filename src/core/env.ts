import fs from 'node:fs';
import { readHarnessEnv } from './env-vars.mjs';
import { projectPath, resolveFromProjectRoot } from './paths.mjs';

export type RegressionEnv = {
  name: string;
  [key: string]: unknown;
};

export function loadEnv<TEnv extends RegressionEnv = RegressionEnv>(
  envName = readHarnessEnv('ENV', 'dev')
): TEnv {
  const configPath = projectPath('config', `${envName}.json`);
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as TEnv;
}
export { resolveFromProjectRoot };
