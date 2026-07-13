import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createResumedRunContext, saveRunContext, type RunContextBase } from '../../src/core/run-context.js';

test.describe('run context persistence', () => {
  test('saves run context as parseable JSON', async () => {
    const run = minimalRunContext(await makeTempRunDir('save'));

    await saveRunContext(run);

    const saved = JSON.parse(await fs.readFile(path.join(run.artifacts.runDir, 'run-context.json'), 'utf8'));
    expect(saved.runId).toBe(run.runId);
  });

  test('reports empty resume context as corrupted', async () => {
    const sourcePath = path.join(await makeTempRunDir('empty'), 'run-context.json');
    await fs.writeFile(sourcePath, '', 'utf8');

    await expect(
      createResumedRunContext(minimalRunContext(await makeTempRunDir('resume')), {
        resumeContextPath: sourcePath,
      })
    ).rejects.toThrow(/empty or corrupted/);
  });
});

async function makeTempRunDir(label: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), `e2e-run-context-${label}-`));
}

function minimalRunContext(runDir: string): RunContextBase {
  return {
    pipelineId: 'demo-pipeline',
    envName: 'dev',
    runId: 'REG-TEST',
    startedAt: new Date('2026-06-18T00:00:00Z').toISOString(),
    artifacts: {
      runDir,
    },
    plan: {
      schemaVersion: 1,
      runId: 'REG-TEST',
      pipelineId: 'demo-pipeline',
      module: 'demo',
      envName: 'dev',
      mode: 'run',
      source: 'pipeline',
      createdAt: new Date('2026-06-18T00:00:00Z').toISOString(),
      pipeline: {
        schemaVersion: 1,
        id: 'demo-pipeline',
        name: 'Demo Pipeline',
        source: 'pipeline',
        context: {
          scope: 'pipeline',
          artifact: 'run-context.json',
        },
        nodes: [],
      },
      stages: [],
    },
    input: {},
    checkpoints: [],
  };
}
