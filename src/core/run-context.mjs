import fs from 'node:fs/promises';
import path from 'node:path';

export async function saveRunContext(run) {
  await fs.mkdir(run.artifacts.runDir, { recursive: true });
  const targetPath = contextPath(run);
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(run, null, 2), 'utf8');
  await fs.rename(tempPath, targetPath);
}

export async function createResumedRunContext(defaultRun, options = {}) {
  if (!options.resumeContextPath) {
    return defaultRun;
  }

  const previousRun = await readRunContextFile(options.resumeContextPath);
  return {
    ...defaultRun,
    ...previousRun,
    pipelineId: defaultRun.pipelineId,
    envName: defaultRun.envName,
    runId: defaultRun.runId,
    startedAt: defaultRun.startedAt,
    artifacts: defaultRun.artifacts,
    plan: defaultRun.plan,
    input: defaultRun.input,
    checkpoints: checkpointsBeforeStage(
      previousRun.checkpoints || [],
      previousRun.plan,
      options.resumeStartStageId
    ),
    resume: {
      ...(previousRun.resume || {}),
      sourceRunId: previousRun.runId,
      sourcePipelineId: previousRun.pipelineId,
      sourceContextPath: options.resumeContextPath,
      startStageId: options.resumeStartStageId,
      startedAt: defaultRun.startedAt,
    },
  };
}

async function readRunContextFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  if (!content.trim()) {
    throw new Error(`Cannot read run context because ${filePath} is empty or corrupted.`);
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Cannot read run context because ${filePath} is empty or corrupted. ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function addCheckpoint(run, checkpoint) {
  run.checkpoints.push({
    ...checkpoint,
    at: new Date().toISOString(),
  });
  await saveRunContext(run);
}

export function contextPath(run) {
  return path.join(run.artifacts.runDir, 'run-context.json');
}

function checkpointsBeforeStage(checkpoints, plan, resumeStartStageId) {
  if (!resumeStartStageId) {
    return checkpoints.filter(checkpoint => checkpoint.status !== 'failed');
  }

  const stageIds = plannedStageIds(plan);
  const startIndex = stageIds.indexOf(resumeStartStageId);
  if (startIndex === -1) {
    return checkpoints.filter(checkpoint => checkpoint.status !== 'failed');
  }

  const keepIds = new Set(stageIds.slice(0, startIndex));
  return checkpoints.filter(checkpoint => keepIds.has(checkpoint.stageId));
}

function plannedStageIds(plan) {
  const pipelineNodeIds = plan?.pipeline?.nodes
    ?.filter(node => node.type === 'stage')
    .map(node => node.id)
    .filter(Boolean) ?? [];
  if (pipelineNodeIds.length > 0) {
    return pipelineNodeIds;
  }

  return plan?.stages?.map(stage => stage.refId || stage.id).filter(Boolean) ?? [];
}
