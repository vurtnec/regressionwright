import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scaffoldScript = path.join(packageRoot, 'bin/create-regressionwright.mjs');

test.describe('project scaffold', () => {
  test('keeps optional reporters out of the default project', () => {
    const projectRoot = scaffoldProject([]);
    const packageJson = readJson(path.join(projectRoot, 'package.json'));
    const playwrightConfig = fs.readFileSync(path.join(projectRoot, 'playwright.config.ts'), 'utf8');

    expect(packageJson.devDependencies['playwright-smart-reporter']).toBeUndefined();
    expect(playwrightConfig).not.toContain('playwright-smart-reporter');
    expect(playwrightConfig).not.toContain('__OPTIONAL_REPORTER');
  });

  test('adds StageWright only when requested', () => {
    const projectRoot = scaffoldProject(['--reporter', 'stagewright']);
    const packageJson = readJson(path.join(projectRoot, 'package.json'));
    const playwrightConfig = fs.readFileSync(path.join(projectRoot, 'playwright.config.ts'), 'utf8');

    expect(packageJson.devDependencies['playwright-smart-reporter']).toBe('1.6.5');
    expect(playwrightConfig).toContain("process.env.E2E_REGRESSION_MODULE || 'demo'");
    expect(playwrightConfig).toContain("['playwright-smart-reporter'");
    expect(playwrightConfig).not.toContain('__MODULE_ID__');
    expect(playwrightConfig).not.toContain('__OPTIONAL_REPORTER');
  });
});

function scaffoldProject(extraArgs: string[]) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'regressionwright-scaffold-'));
  const projectRoot = path.join(tempRoot, 'demo-regression-test');
  execFileSync(process.execPath, [
    scaffoldScript,
    projectRoot,
    '--module',
    'demo',
    '--core-package',
    'workspace:*',
    ...extraArgs,
  ], { stdio: 'pipe' });
  return projectRoot;
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
