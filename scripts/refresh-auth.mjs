#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { fixedProfileLaunchOptions } from '../src/core/browser-profile.mjs';
import { parseCliOptions } from '../src/core/cli-options.mjs';
import { readHarnessEnv } from '../src/core/env-vars.mjs';
import { defaultModuleId, loadProjectHarnessAdapter } from '../src/core/project-adapter.mjs';

const args = parseCliOptions(process.argv.slice(2));
const moduleId = args.module || defaultModuleId();
const envName = args.env || readHarnessEnv('ENV', 'dev');
const adapter = await loadProjectHarnessAdapter(moduleId);

if (typeof adapter.createAuthSessionConfig !== 'function' || typeof adapter.waitForAuthReady !== 'function') {
  throw new Error(`Module "${moduleId}" does not define auth browser support in harness-adapter.mjs.`);
}

const authConfig = adapter.createAuthSessionConfig({ envName, options: args });
fs.mkdirSync(path.dirname(authConfig.authState), { recursive: true });
fs.mkdirSync(authConfig.userDataDir, { recursive: true });

const context = await chromium.launchPersistentContext(
  authConfig.userDataDir,
  fixedProfileLaunchOptions(false)
);

try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(authConfig.url);

  console.log('');
  for (const line of authConfig.introLines || []) {
    console.log(line);
  }
  console.log('');
  await waitForAuthReadyOrEnter(page, adapter, authConfig);

  await page.goto(authConfig.url);
  await page.waitForLoadState('domcontentloaded');
  await adapter.waitForAuthReady(page, authConfig);
  await context.storageState({ path: authConfig.authState });
  console.log(authConfig.savedMessage || `Saved auth state to ${authConfig.authState}`);
} finally {
  await context.close();
}

function waitForAuthReadyOrEnter(page, adapter, authConfig) {
  const waitForApp = adapter.waitForAuthReady(page, authConfig);
  const waitForEnter = waitForEnterKey();

  return Promise.race([waitForApp, waitForEnter]);
}

function waitForEnterKey() {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}
