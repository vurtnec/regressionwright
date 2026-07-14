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

  test('creates an Appium project without Playwright runtime files', () => {
    const projectRoot = scaffoldProject(['--executor', 'appium']);
    const packageJson = readJson(path.join(projectRoot, 'package.json'));
    const adapter = fs.readFileSync(
      path.join(projectRoot, 'src/modules/demo/harness-adapter.mjs'),
      'utf8'
    );
    const stage = readJson(path.join(projectRoot, 'stages/demo/app-session/default.json'));

    expect(packageJson.devDependencies.appium).toBe('3.5.2');
    expect(packageJson.devDependencies.webdriverio).toBe('9.29.1');
    expect(packageJson.devDependencies['@playwright/test']).toBeUndefined();
    expect(fs.existsSync(path.join(projectRoot, 'playwright.config.ts'))).toBe(false);
    expect(adapter).toContain("export const executorType = 'appium'");
    expect(stage.executor.type).toBe('appium');
    expect(adapter).not.toContain('__MODULE_ID__');
  });

  test('rejects StageWright for an Appium project', () => {
    expect(() => scaffoldProject(['--executor', 'appium', '--reporter', 'stagewright']))
      .toThrow(/only supported with --executor playwright/);
  });

  test('creates a Mini Program project with a runnable two-stage fixture', () => {
    const projectRoot = scaffoldProject(['--executor', 'miniprogram']);
    const packageJson = readJson(path.join(projectRoot, 'package.json'));
    const adapter = fs.readFileSync(
      path.join(projectRoot, 'src/modules/demo/harness-adapter.mjs'),
      'utf8'
    );
    const pipeline = readJson(path.join(projectRoot, 'pipelines/demo/regression.json'));
    const launchStage = readJson(
      path.join(projectRoot, 'stages/demo/mini-program-session/default.json')
    );

    expect(packageJson.devDependencies['miniprogram-automator']).toBe('0.12.1');
    expect(packageJson.devDependencies.appium).toBeUndefined();
    expect(packageJson.devDependencies['@playwright/test']).toBeUndefined();
    expect(adapter).toContain("export const executorType = 'miniprogram'");
    expect(launchStage.executor.type).toBe('miniprogram');
    expect(pipeline.stages).toHaveLength(2);
    expect(fs.existsSync(path.join(projectRoot, 'fixtures/miniapp/project.config.json'))).toBe(true);
    expect(adapter).not.toContain('__MODULE_ID__');
  });

  test('rejects StageWright for a Mini Program project', () => {
    expect(() => scaffoldProject(['--executor', 'miniprogram', '--reporter', 'stagewright']))
      .toThrow(/only supported with --executor playwright/);
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
