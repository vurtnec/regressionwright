import fs from 'node:fs';
import { readHarnessEnv } from './env-vars.mjs';
import { projectPath, resolveFromProjectRoot } from './paths.mjs';
export function loadEnv(envName = readHarnessEnv('ENV', 'dev')) {
    const configPath = projectPath('config', `${envName}.json`);
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
export { resolveFromProjectRoot };
