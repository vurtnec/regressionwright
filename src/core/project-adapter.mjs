import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJson } from './run-data.mjs';
import { projectPath, resolveFromProjectRoot } from './paths.mjs';
import { readHarnessEnv } from './env-vars.mjs';

export function defaultModuleId(fallback) {
  return readHarnessEnv('MODULE') || loadHarnessConfig()?.defaultModule || fallback;
}

export async function loadProjectHarnessAdapter(moduleId = defaultModuleId()) {
  if (!moduleId) {
    return {};
  }

  const adapterPath = resolveFromProjectRoot(adapterPathForModule(moduleId));
  const adapterUrl = pathToFileURL(adapterPath).href;
  try {
    return await import(adapterUrl);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && error?.url === adapterUrl) {
      return {};
    }
    throw error;
  }
}

export function loadHarnessConfig() {
  const configPath = projectPath('config', 'harness.json');
  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  return readJson(configPath);
}

export function moduleConfig(moduleId) {
  const config = loadHarnessConfig();
  const modules = config?.modules;
  if (!modules || typeof modules !== 'object' || Array.isArray(modules)) {
    return undefined;
  }
  return modules[moduleId];
}

function adapterPathForModule(moduleId) {
  const config = loadHarnessConfig();
  const modules = config?.modules;
  if (modules && typeof modules === 'object' && !Array.isArray(modules)) {
    const moduleEntry = modules[moduleId];
    if (!moduleEntry) {
      throw new Error(`Module "${moduleId}" is not registered in config/harness.json.`);
    }
    if (moduleEntry.adapterPath) {
      return moduleEntry.adapterPath;
    }
  }

  return path.join('src', 'modules', moduleId, 'harness-adapter.mjs');
}
