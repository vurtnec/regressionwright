#!/usr/bin/env node
import fs from 'node:fs';
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

if (typeof adapter.createBrowserProfileConfig !== 'function') {
  throw new Error(`Module "${moduleId}" does not define browser profile support in harness-adapter.mjs.`);
}

const profileConfig = adapter.createBrowserProfileConfig({ envName, options: args });
fs.mkdirSync(profileConfig.userDataDir, { recursive: true });

const context = await chromium.launchPersistentContext(
  profileConfig.userDataDir,
  fixedProfileLaunchOptions(false)
);

try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(profileConfig.url);

  console.log('');
  console.log(`Opened ${profileConfig.url}`);
  console.log(`Profile: ${profileConfig.userDataDir}`);
  for (const line of profileConfig.introLines || []) {
    console.log(line);
  }
  console.log('');
  await waitForEnter();
} finally {
  await context.close();
}

function waitForEnter() {
  return new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}
