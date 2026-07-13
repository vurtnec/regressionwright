import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runDataModuleUrl = pathToFileURL(path.join(packageRoot, 'src/core/run-data.mjs')).href;

test.describe('run data schema loading', () => {
  test('rejects unsupported contract schema keywords during load', () => {
    const projectRoot = createFixtureProject({
      contractOutputSchema: {
        type: 'object',
        oneOf: [{ required: ['result'] }],
      },
    });

    expect(() =>
      runNodeWithProjectRoot(projectRoot, `
        const { loadStageContract } = await import(${JSON.stringify(runDataModuleUrl)});
        loadStageContract('demo', 'content-check');
      `)
    ).toThrow(/unsupported schema keyword "oneOf"/);
  });

  test('rejects unsupported checks schema keywords during load', () => {
    const projectRoot = createFixtureProject({
      checksOutputSchema: {
        type: 'object',
        allOf: [{ required: ['result'] }],
      },
    });

    expect(() =>
      runNodeWithProjectRoot(projectRoot, `
        const { loadStageChecks } = await import(${JSON.stringify(runDataModuleUrl)});
        loadStageChecks('demo', 'content-check', 'strict');
      `)
    ).toThrow(/unsupported schema keyword "allOf"/);
  });
});

function createFixtureProject(params: {
  contractOutputSchema?: Record<string, unknown>;
  checksOutputSchema?: Record<string, unknown>;
}) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-harness-schema-'));
  writeJson(path.join(projectRoot, 'config/harness.json'), {
    schemaVersion: 1,
    defaultModule: 'demo',
    modules: {},
  });
  writeJson(path.join(projectRoot, 'stage-registry/demo.json'), {
    schemaVersion: 1,
    module: 'demo',
    description: 'Schema keyword validation fixture.',
    stages: [
      {
        id: 'content-check',
        stage: 'content-check',
        contractPath: 'contracts/demo/content-check.json',
        implementationPath: 'tests/demo/stages/content-check.ts',
        executor: {
          type: 'playwright',
          specPath: 'tests/demo/demo.spec.ts',
        },
        tags: [],
        status: 'test',
      },
    ],
  });
  writeJson(path.join(projectRoot, 'contracts/demo/content-check.json'), {
    schemaVersion: 1,
    id: 'content-check',
    module: 'demo',
    name: 'Content Check',
    description: 'Schema keyword validation fixture.',
    executor: 'playwright',
    mode: 'ui',
    requires: [],
    produces: [],
    inputSchema: { type: 'object' },
    outputSchema: params.contractOutputSchema || { type: 'object' },
    errorSchema: { type: 'object' },
    sideEffects: [],
    evidence: [],
  });
  writeJson(path.join(projectRoot, 'checks/demo/content-check/strict.json'), {
    schemaVersion: 1,
    id: 'content-check.strict',
    module: 'demo',
    stage: 'content-check',
    checks: 'strict',
    outputSchema: params.checksOutputSchema || { type: 'object' },
  });
  return projectRoot;
}

function runNodeWithProjectRoot(projectRoot: string, code: string) {
  execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    env: {
      ...process.env,
      HARNESS_PROJECT_ROOT: projectRoot,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
