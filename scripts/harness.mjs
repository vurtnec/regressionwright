#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  createRunId,
  applyInputParams,
  createRegressionInput,
  createRegressionPlan,
  createStageRegistrySummary,
  consumerProjectRoot,
  loadEnvConfig,
  readJson,
  resolveFromHarnessPackageRoot,
  resolveFromProjectRoot,
  runFilesFor,
  writeJson,
} from '../src/core/run-data.mjs';
import { assertPlanInput } from '../src/core/schema.mjs';
import { categoryForCode } from '../src/core/stage-error.mjs';
import { camelCaseOptionKey } from '../src/core/cli-options.mjs';
import { harnessEnvKey, readHarnessEnv, setHarnessEnv, syncHarnessEnv } from '../src/core/env-vars.mjs';
import { defaultModuleId, loadProjectHarnessAdapter } from '../src/core/project-adapter.mjs';

const projectSkillIntegrations = {
  codex: {
    label: 'Codex',
    targetRelativeDir: path.join('.agents', 'skills', 'regressionwright'),
  },
  claude: {
    label: 'Claude',
    targetRelativeDir: path.join('.claude', 'skills', 'regressionwright'),
  },
};

const command = process.argv[2];

try {
  if (command === '--integration' || command?.startsWith('--integration=')) {
    integrationCommand(process.argv.slice(2));
  } else if (command === 'integration') {
    integrationCommand(process.argv.slice(3));
  } else if (command === 'run') {
    const result = await runCommand(process.argv.slice(3));
    process.exit(result.status);
  } else if (command === 'run-many') {
    const result = await runManyCommand(process.argv.slice(3));
    process.exit(result.status);
  } else if (command === 'daily') {
    const result = await dailyCommand(process.argv.slice(3));
    process.exit(result.status);
  } else if (command === 'resume') {
    const result = await resumeCommand(process.argv.slice(3));
    process.exit(result.status);
  } else if (command === 'diagnose') {
    await diagnoseCommand(process.argv.slice(3));
  } else if (command === 'registry') {
    registryCommand(process.argv.slice(3));
  } else if (command === 'ai-params-context') {
    await aiParamsContextCommand(process.argv.slice(3));
  } else if (command === 'catalog') {
    throw new Error('Command "catalog" was renamed to "registry". Use: pnpm regressionwright registry [module-id]');
  } else {
    await printHelp();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function runCommand(args) {
  const options = parseRunArgs(args);
  const initialProjectAdapter = await loadProjectHarnessAdapter(options.moduleId);
  options.pipelineId = options.pipelineId || initialProjectAdapter.defaultPipelineId || `${options.moduleId}-regression`;
  initialProjectAdapter.validateRunOptions?.({ options, projectOptions: options.projectOptions });
  const runtimeOptions = { ...options, ...options.projectOptions };
  const env = loadEnvConfig(options.envName);
  const runId = options.runId || createRunId();
  const files = runFilesFor(options.pipelineId, runId);
  const plan = createRegressionPlan({
    pipelineId: options.pipelineId,
    runId,
    envName: options.envName,
    stageIds: options.stageIds,
  });
  const projectAdapter = await loadProjectHarnessAdapter(plan.module);
  const runtimeInput = projectAdapter.createRuntimeInput?.({ plan, options: runtimeOptions }) || {};
  const baseInput = options.inputPath
    ? readJson(resolveFromProjectRoot(options.inputPath))
    : await createRegressionInput({
        pipelineId: options.pipelineId,
        runId,
        envName: options.envName,
        env,
        dataVariant: options.dataVariant,
        stageIds: stageRequestsForInput(plan),
        runtimeInput,
      });
  const input = options.inputParams
    ? applyInputParams(baseInput, options.inputParams.value, { source: options.inputParams.source })
    : baseInput;
  const runInput = {
    ...input,
    schemaVersion: input.schemaVersion || 1,
    runId,
    pipelineId: options.pipelineId,
    envName: options.envName,
  };

  assertPlanInput(plan, runInput);

  fs.mkdirSync(files.runDir, { recursive: true });
  writeJson(files.planPath, plan);
  writeJson(files.inputPath, runInput);

  const envVars = {
    ...process.env,
  };
  setHarnessEnv(envVars, 'MODULE', plan.module);
  setHarnessEnv(envVars, 'ENV', options.envName);
  setHarnessEnv(envVars, 'PIPELINE', options.pipelineId);
  setHarnessEnv(envVars, 'RUN_ID', runId);
  setHarnessEnv(envVars, 'RUN_DIR', files.runDir);
  setHarnessEnv(envVars, 'PLAN_PATH', files.planPath);
  setHarnessEnv(envVars, 'INPUT_PATH', files.inputPath);
  setHarnessEnv(envVars, 'STAGE_FILTER', stageRequestsForInput(plan).join(','));
  setHarnessEnv(envVars, 'PLAYWRIGHT_OUTPUT_DIR', path.join(files.runDir, 'playwright'));
  setHarnessEnv(envVars, 'PLAYWRIGHT_REPORT_DIR', path.join(files.runDir, 'playwright-report'));

  if (options.dataVariant) {
    setHarnessEnv(envVars, 'DATA_VARIANT', options.dataVariant);
  }

  projectAdapter.applyRunEnv?.({ envVars, options: runtimeOptions, plan, runtimeInput });

  if (options.headed) {
    setHarnessEnv(envVars, 'HEADLESS', '0');
  } else {
    syncHarnessEnv(envVars, 'HEADLESS', '1');
  }

  console.log(`Run ID: ${runId}`);
  console.log(`Plan: ${files.planPath}`);
  console.log(`Input: ${files.inputPath}`);
  console.log(`Artifacts: ${files.runDir}`);
  console.log(`Playwright report: ${envVars[harnessEnvKey('PLAYWRIGHT_REPORT_DIR')]}`);

  const result = executePlaywrightRun({ plan, projectAdapter, envVars });
  await runAfterPlaywrightRun(projectAdapter, {
    result,
    plan,
    runId,
    pipelineId: options.pipelineId,
    runDir: files.runDir,
    planPath: files.planPath,
    inputPath: files.inputPath,
    envVars,
  });

  return {
    status: result.status ?? 1,
    runId,
    pipelineId: options.pipelineId,
    runDir: files.runDir,
    planPath: files.planPath,
    inputPath: files.inputPath,
  };
}

async function runManyCommand(args) {
  const options = parseRunManyArgs(args);
  const results = [];
  let status = 0;

  console.log(`Pipelines: ${options.pipelineIds.join(', ')}`);
  if (options.delayMs > 0) {
    console.log(`Delay: ${formatDelay(options.delayMs)} between pipelines`);
  }
  if (options.continueOnFailure) {
    console.log('Failure policy: continue after failed pipelines');
  }

  for (let index = 0; index < options.pipelineIds.length; index += 1) {
    const pipelineId = options.pipelineIds[index];
    console.log('');
    console.log(`[${index + 1}/${options.pipelineIds.length}] Running ${pipelineId}`);

    const result = await runCommand([...options.runArgs, pipelineId]);
    results.push(result);
    const pipelineStatus = result.status ?? 1;
    if (pipelineStatus === 0) {
      console.log(`[${index + 1}/${options.pipelineIds.length}] Passed ${pipelineId}`);
    } else {
      status = status || pipelineStatus;
      console.log(`[${index + 1}/${options.pipelineIds.length}] Failed ${pipelineId} (exit ${pipelineStatus})`);
      if (!options.continueOnFailure) {
        break;
      }
    }

    if (index < options.pipelineIds.length - 1 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  console.log('');
  console.log('Run-many summary:');
  for (const result of results) {
    console.log(`- ${result.pipelineId}: ${result.status === 0 ? 'passed' : `failed (${result.status})`} ${result.runDir}`);
  }

  const skippedCount = options.pipelineIds.length - results.length;
  if (skippedCount > 0) {
    console.log(`- skipped: ${options.pipelineIds.slice(results.length).join(', ')}`);
  }

  return {
    status,
    results,
  };
}

async function dailyCommand(args) {
  const result = await runCommand(args);
  console.log('');
  console.log(`Daily summary for ${result.runDir}`);
  await diagnoseCommand([result.runDir]);
  return result;
}

async function resumeCommand(args) {
  const options = parseResumeArgs(args);
  const sourceFiles = resolveRunArtifactFiles(options.target);
  const sourcePlan = readJson(sourceFiles.planPath);
  const sourceInput = readJson(sourceFiles.inputPath);
  const sourceContext = readJson(sourceFiles.contextPath);
  const initialProjectAdapter = await loadProjectHarnessAdapter(sourcePlan.module);
  initialProjectAdapter.validateRunOptions?.({ options, projectOptions: options.projectOptions });
  const runtimeOptions = { ...options, ...options.projectOptions };
  const resumeSelection = selectResumeStages(sourcePlan, sourceContext, options.fromStage);
  const runId = createRunId();
  const files = runFilesFor(sourcePlan.pipelineId, runId);
  const plan = createResumePlan({
    sourcePlan,
    runId,
    envName: options.envName || sourcePlan.envName,
    resumeSelection,
    sourceFiles,
  });
  const input = {
    ...sourceInput,
    runId,
    pipelineId: plan.pipelineId,
    envName: plan.envName,
    data: {
      ...(sourceInput.data || {}),
      resume: {
        applied: true,
        sourceRunId: sourcePlan.runId,
        sourceRunDir: sourceFiles.runDir,
        startStageId: resumeSelection.startNode.id,
      },
    },
  };

  assertPlanInput(plan, input);

  fs.mkdirSync(files.runDir, { recursive: true });
  writeJson(files.planPath, plan);
  writeJson(files.inputPath, input);

  const projectAdapter = await loadProjectHarnessAdapter(plan.module);
  const envVars = {
    ...process.env,
  };
  setHarnessEnv(envVars, 'MODULE', plan.module);
  setHarnessEnv(envVars, 'ENV', plan.envName);
  setHarnessEnv(envVars, 'PIPELINE', plan.pipelineId);
  setHarnessEnv(envVars, 'RUN_ID', runId);
  setHarnessEnv(envVars, 'RUN_DIR', files.runDir);
  setHarnessEnv(envVars, 'PLAN_PATH', files.planPath);
  setHarnessEnv(envVars, 'INPUT_PATH', files.inputPath);
  setHarnessEnv(envVars, 'RESUME_CONTEXT_PATH', sourceFiles.contextPath);
  setHarnessEnv(envVars, 'RESUME_SOURCE_RUN_DIR', sourceFiles.runDir);
  setHarnessEnv(envVars, 'RESUME_START_STAGE', resumeSelection.startNode.id);
  setHarnessEnv(envVars, 'STAGE_FILTER', plan.stages.map(stage => stage.refId || stage.id).join(','));
  setHarnessEnv(envVars, 'PLAYWRIGHT_OUTPUT_DIR', path.join(files.runDir, 'playwright'));
  setHarnessEnv(envVars, 'PLAYWRIGHT_REPORT_DIR', path.join(files.runDir, 'playwright-report'));

  projectAdapter.applyRunEnv?.({ envVars, options: runtimeOptions, plan, runtimeInput: undefined });

  if (options.headed) {
    setHarnessEnv(envVars, 'HEADLESS', '0');
  } else {
    syncHarnessEnv(envVars, 'HEADLESS', '1');
  }

  console.log(`Resume source: ${sourceFiles.runDir}`);
  console.log(`Resume from: ${resumeSelection.startNode.id}`);
  console.log(`Failed/pending stage: ${resumeSelection.targetNode.id}`);
  console.log(`Run ID: ${runId}`);
  console.log(`Plan: ${files.planPath}`);
  console.log(`Input: ${files.inputPath}`);
  console.log(`Artifacts: ${files.runDir}`);
  console.log(`Playwright report: ${envVars[harnessEnvKey('PLAYWRIGHT_REPORT_DIR')]}`);

  const result = executePlaywrightRun({ plan, projectAdapter, envVars });
  await runAfterPlaywrightRun(projectAdapter, {
    result,
    plan,
    runId,
    pipelineId: plan.pipelineId,
    runDir: files.runDir,
    planPath: files.planPath,
    inputPath: files.inputPath,
    envVars,
  });

  return {
    status: result.status ?? 1,
    runId,
    pipelineId: plan.pipelineId,
    runDir: files.runDir,
    planPath: files.planPath,
    inputPath: files.inputPath,
  };
}

async function diagnoseCommand(args) {
  const target = args[0];
  if (!target) {
    throw new Error('Usage: pnpm regressionwright diagnose <run-dir-or-run-context-path>');
  }

  const resolved = resolveFromProjectRoot(target);
  const runDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  const contextPath = path.join(runDir, 'run-context.json');
  const planPath = path.join(runDir, 'plan.json');
  const inputPath = path.join(runDir, 'input.json');
  const summaryPath = path.join(runDir, 'summary.json');

  const context = fs.existsSync(contextPath) ? readJson(contextPath) : undefined;
  const plan = fs.existsSync(planPath) ? readJson(planPath) : undefined;
  const input = fs.existsSync(inputPath) ? readJson(inputPath) : undefined;
  const failedCheckpoint = context?.checkpoints?.find(checkpoint => checkpoint.status === 'failed');
  const plannedStageIds = plannedCheckpointIds(plan);
  const passedStageIds = context?.checkpoints
    ?.filter(checkpoint => checkpoint.status === 'passed')
    .map(checkpoint => checkpoint.stageId) ?? [];
  const moduleId = context?.module ?? plan?.module ?? input?.module;
  const projectAdapter = await loadProjectHarnessAdapter(moduleId);

  const classification = classifyRun({ failedCheckpoint, plannedStageIds, passedStageIds });
  const summary = {
    schemaVersion: 1,
    runId: context?.runId ?? plan?.runId ?? input?.runId,
    pipelineId: context?.pipelineId ?? plan?.pipelineId ?? input?.pipelineId,
    status: classification.status,
    classification: classification.classification,
    errorCode: classification.errorCode,
    reason: classification.reason,
    failedStageId: failedCheckpoint?.stageId,
    error: summarizeStageError(failedCheckpoint?.error),
    stageResults: summarizeStageResults(plan, context),
    pipeline: summarizePipeline(plan?.pipeline),
    data: input?.data,
    ...projectAdapter.summarizeDiagnose?.({ context, plan, input }),
    runDir,
    planPath: fs.existsSync(planPath) ? planPath : undefined,
    inputPath: fs.existsSync(inputPath) ? inputPath : undefined,
    contextPath: fs.existsSync(contextPath) ? contextPath : undefined,
  };

  writeJson(summaryPath, summary);
  console.log(JSON.stringify(summary, null, 2));
}

function registryCommand(args) {
  const moduleId = parseRegistryArgs(args).moduleId;
  const summary = createStageRegistrySummary(moduleId);
  console.log(JSON.stringify(summary, null, 2));
}

async function aiParamsContextCommand(args) {
  const options = parseAiParamsContextArgs(args);
  const initialProjectAdapter = await loadProjectHarnessAdapter(options.moduleId);
  options.pipelineId = options.pipelineId || initialProjectAdapter.defaultPipelineId || `${options.moduleId}-regression`;
  initialProjectAdapter.validateRunOptions?.({ options, projectOptions: options.projectOptions });

  const runtimeOptions = { ...options, ...options.projectOptions };
  const env = loadEnvConfig(options.envName);
  const runId = options.runId || createRunId();
  const plan = createRegressionPlan({
    pipelineId: options.pipelineId,
    runId,
    envName: options.envName,
    stageIds: options.stageIds,
  });
  const projectAdapter = await loadProjectHarnessAdapter(plan.module);
  const runtimeInput = projectAdapter.createRuntimeInput?.({ plan, options: runtimeOptions }) || {};
  const baseInput = await createRegressionInput({
    pipelineId: options.pipelineId,
    runId,
    envName: options.envName,
    env,
    dataVariant: options.dataVariant,
    stageIds: stageRequestsForInput(plan),
    runtimeInput,
  });
  const runInput = {
    ...baseInput,
    schemaVersion: baseInput.schemaVersion || 1,
    runId,
    pipelineId: options.pipelineId,
    envName: options.envName,
  };

  assertPlanInput(plan, runInput);

  const context = projectAdapter.createAiParamsContext?.({
    plan,
    baseInput: runInput,
    env,
    options: runtimeOptions,
    mode: options.mode,
  }) || createDefaultAiParamsContext({
    plan,
    baseInput: runInput,
    env,
    options: runtimeOptions,
    mode: options.mode,
  });

  console.log(JSON.stringify(context, null, 2));
}

function integrationCommand(args) {
  const options = parseIntegrationArgs(args);

  if (options.action === 'list') {
    console.log(JSON.stringify({
      schemaVersion: 1,
      projectRoot: consumerProjectRoot,
      integrations: Object.entries(projectSkillIntegrations).map(([id, integration]) => ({
        id,
        label: integration.label,
        targetDir: path.join(consumerProjectRoot, integration.targetRelativeDir),
      })),
    }, null, 2));
    return;
  }

  const integrationIds = options.integration === 'all'
    ? Object.keys(projectSkillIntegrations)
    : [options.integration];

  for (const integrationId of integrationIds) {
    const installed = installProjectSkillIntegration(integrationId);
    console.log(`Installed ${installed.label} project skill: ${installed.targetDir}`);
  }
}

function parseIntegrationArgs(args) {
  let action = 'install';
  let integration;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === 'install') {
      action = 'install';
    } else if (arg === 'list') {
      action = 'list';
    } else if (arg === '--integration') {
      integration = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--integration=')) {
      integration = arg.slice('--integration='.length);
    } else if (arg === '--help' || arg === '-h') {
      printIntegrationHelp();
      process.exit(0);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown integration option: ${arg}`);
    } else {
      integration = arg;
    }
  }

  if (action === 'list') {
    return { action };
  }

  if (!integration) {
    throw new Error('Usage: pnpm regressionwright integration install <codex|claude|all>');
  }

  const normalized = integration.toLowerCase();
  if (normalized !== 'all' && !projectSkillIntegrations[normalized]) {
    throw new Error(`Unknown integration "${integration}". Supported integrations: ${Object.keys(projectSkillIntegrations).join(', ')}, all.`);
  }

  return {
    action,
    integration: normalized,
  };
}

function installProjectSkillIntegration(integrationId) {
  const integration = projectSkillIntegrations[integrationId];
  if (!integration) {
    throw new Error(`Unknown integration "${integrationId}".`);
  }

  const sourceDir = resolveFromHarnessPackageRoot(path.join('skills', 'regressionwright'));
  const targetDir = path.join(consumerProjectRoot, integration.targetRelativeDir);

  if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) {
    throw new Error(`Cannot install ${integration.label} skill because package skill source is missing: ${sourceDir}`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  copyDirectorySync(sourceDir, targetDir);

  return {
    id: integrationId,
    label: integration.label,
    targetDir,
  };
}

function copyDirectorySync(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectorySync(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function createDefaultAiParamsContext({ plan, baseInput, env, options, mode }) {
  return {
    schemaVersion: 1,
    kind: 'ai-params-context',
    module: plan.module,
    pipelineId: plan.pipelineId,
    runId: plan.runId,
    envName: plan.envName,
    mode,
    data: {
      generatedBy: baseInput.data?.generatedBy,
      templateId: baseInput.data?.templateId,
      variantId: baseInput.data?.variantId,
      scenarioId: baseInput.data?.scenarioId,
      dateSetId: baseInput.data?.dateSetId,
      dataProfile: env.dataProfile,
    },
    selectedStages: plannedStageNodes(plan).map(node => ({
      id: node.id,
      stage: node.stage,
      variant: node.variant,
      actor: node.actor,
      dataKey: node.dataKey,
      dataKeys: node.dataKeys,
    })),
    rules: [
      'Generate the smallest --input-params JSON object needed for the requested scenario.',
      'Do not override runtime outputs, browser state, credentials, actors, dates, or UI-constrained values unless this context explicitly allows the path.',
      'Keep generated content business-realistic and free of AI/test/regression wording.',
    ],
    allowedOverridePaths: [],
    copyOnlyPaths: [],
    blockedOverridePaths: [
      'runId',
      'pipelineId',
      'envName',
      'schemaVersion',
      'data',
      'stageInputs',
    ],
    paramsTemplate: {},
    command: dailyCommandForContext(plan, options),
  };
}

function dailyCommandForContext(plan, options) {
  const parts = ['pnpm regressionwright daily', plan.pipelineId, '--env', plan.envName, '--run-id', plan.runId];
  if (options.dataVariant) {
    parts.push('--data-variant', options.dataVariant);
  }
  return `${parts.join(' ')} --input-params <params-file>`;
}

function resolvePlaywrightBin() {
  const candidates = [
    path.join(consumerProjectRoot, 'node_modules', '.bin', 'playwright'),
    resolveFromHarnessPackageRoot(path.join('node_modules', '.bin', 'playwright')),
  ];
  const playwrightBin = candidates.find(candidate => fs.existsSync(candidate));
  if (!playwrightBin) {
    throw new Error(
      'Cannot find Playwright binary. Run "pnpm install" and "pnpm exec playwright install chromium" in the regression project.'
    );
  }
  return playwrightBin;
}

function executePlaywrightRun({ plan, projectAdapter, envVars }) {
  const playwrightBin = resolvePlaywrightBin();
  const specPath = selectPlaywrightSpecPath(plan, projectAdapter);
  const args = ['test', specPath, '--project=chromium'];
  if (envVars[harnessEnvKey('HEADLESS')] === '0') {
    args.push('--headed');
  }
  const result = spawnSync(
    playwrightBin,
    args,
    {
      cwd: consumerProjectRoot,
      env: envVars,
      stdio: 'inherit',
    }
  );
  if (result.error) {
    throw result.error;
  }
  return result;
}

async function runAfterPlaywrightRun(projectAdapter, params) {
  if (!projectAdapter.afterPlaywrightRun) {
    return;
  }

  try {
    await projectAdapter.afterPlaywrightRun(params);
  } catch (error) {
    console.warn(`Post-run report hook failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function selectPlaywrightSpecPath(plan, projectAdapter = {}) {
  if (projectAdapter.playwrightSpecPath) {
    return resolveSpecPath(projectAdapter.playwrightSpecPath);
  }

  const packageRunnerSpecs = [
    resolveFromHarnessPackageRoot('tests/harness/pipeline-runner.spec.mjs'),
    resolveFromHarnessPackageRoot('tests/harness/pipeline-runner.spec.ts'),
  ];
  const packageRunnerSpec = packageRunnerSpecs.find(candidate => fs.existsSync(candidate));
  if (packageRunnerSpec) {
    return packageRunnerSpec;
  }

  const specPaths = [
    ...new Set(plan.stages.map(stage => stage.registry?.executor?.specPath).filter(Boolean)),
  ];

  if (specPaths.length === 0) {
    throw new Error('The selected plan does not contain a Playwright spec path.');
  }

  if (specPaths.length > 1) {
    throw new Error(
      `The selected plan spans multiple Playwright specs: ${specPaths.join(', ')}. ` +
        'Split the run or add a higher-level executor.'
    );
  }

  return resolveSpecPath(specPaths[0]);
}

function resolveSpecPath(specPath) {
  return path.isAbsolute(specPath) ? specPath : resolveFromProjectRoot(specPath);
}

function summarizePipeline(pipeline) {
  if (!pipeline) {
    return undefined;
  }

  return {
    id: pipeline.id,
    source: pipeline.source,
    context: pipeline.context,
    nodes: pipeline.nodes?.map(node => ({
      id: node.id,
      type: node.type,
      stage: node.stage,
      stageId: node.stageId,
      variant: node.variant,
      actor: node.actor,
      input: node.input,
      dates: node.dates,
      checks: node.checks,
      resumeBoundary: node.resumeBoundary,
      order: node.order,
      executor: node.type === 'data' ? node.executor : node.executor?.type,
      requires: node.requires,
      produces: node.produces,
    })),
  };
}

function resolveRunArtifactFiles(target) {
  if (!target) {
    throw new Error('Usage: pnpm regressionwright resume <run-dir-or-run-context-path> [--from <stage-ref>]');
  }

  const resolved = resolveFromProjectRoot(target);
  const runDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
  const files = {
    runDir,
    planPath: path.join(runDir, 'plan.json'),
    inputPath: path.join(runDir, 'input.json'),
    contextPath: path.join(runDir, 'run-context.json'),
  };

  for (const [kind, filePath] of Object.entries(files)) {
    if (kind === 'runDir') {
      continue;
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Cannot resume because ${kind} is missing: ${filePath}`);
    }
  }

  return files;
}

function selectResumeStages(plan, context, fromStage) {
  const nodes = plannedStageNodes(plan);
  if (nodes.length === 0) {
    throw new Error('Cannot resume because the source plan has no stage nodes.');
  }

  const checkpointStatus = latestCheckpointStatusMap(context?.checkpoints || []);
  const targetIndex = fromStage
    ? findStageNodeIndex(nodes, fromStage)
    : nodes.findIndex(node => checkpointStatus.get(node.id) !== 'passed');

  if (targetIndex === -1) {
    if (fromStage) {
      throw new Error(`Cannot find resume stage "${fromStage}" in source plan.`);
    }
    throw new Error('The source run has no failed or pending stage to resume.');
  }

  let startIndex = targetIndex;
  for (let index = targetIndex; index >= 0; index -= 1) {
    if (nodes[index].resumeBoundary) {
      startIndex = index;
      break;
    }
  }

  const selectedNodes = nodes.slice(startIndex);
  return {
    targetNode: nodes[targetIndex],
    startNode: nodes[startIndex],
    selectedStageIds: selectedNodes.map(node => node.id),
  };
}

function createResumePlan(params) {
  const selectedStageIds = new Set(params.resumeSelection.selectedStageIds);
  const stages = params.sourcePlan.stages.filter(stage => selectedStageIds.has(stage.refId || stage.id));
  const nodes = (params.sourcePlan.pipeline?.nodes || []).filter(node => node.type !== 'stage' || selectedStageIds.has(node.id));
  return {
    ...params.sourcePlan,
    runId: params.runId,
    envName: params.envName,
    mode: 'resume',
    source: 'resume',
    createdAt: new Date().toISOString(),
    resume: {
      sourceRunId: params.sourcePlan.runId,
      sourcePipelineId: params.sourcePlan.pipelineId,
      sourceRunDir: params.sourceFiles.runDir,
      sourceContextPath: params.sourceFiles.contextPath,
      targetStageId: params.resumeSelection.targetNode.id,
      startStageId: params.resumeSelection.startNode.id,
      selectedStageIds: params.resumeSelection.selectedStageIds,
    },
    pipeline: {
      ...params.sourcePlan.pipeline,
      source: 'resume',
      nodes,
    },
    stages,
  };
}

function latestCheckpointStatusMap(checkpoints) {
  const statuses = new Map();
  for (const checkpoint of checkpoints) {
    statuses.set(checkpoint.stageId, checkpoint.status);
  }
  return statuses;
}

function findStageNodeIndex(nodes, request) {
  return nodes.findIndex(node => stageNodeRequestForms(node).includes(request));
}

function stageNodeRequestForms(node) {
  const forms = [
    node.id,
    node.stageId,
  ];
  if (node.stage && node.variant) {
    forms.push(`${node.stage}/${node.variant}`);
    if (node.actor) {
      forms.push(`${node.stage}/${node.variant}@${node.actor}`);
    }
  }
  return [...new Set(forms.filter(Boolean))];
}

function stageRequestsForInput(plan) {
  return (plan.pipeline?.nodes || [])
    .filter(node => node.type === 'stage')
    .map(node => node.id);
}

function summarizeStageError(error) {
  if (!error) {
    return undefined;
  }

  return {
    code: error.code,
    category: error.category,
    message: error.message,
    evidence: error.evidence,
  };
}

function parseRunArgs(args) {
  let moduleId = defaultModuleId();
  let pipelineId = readHarnessEnv('PIPELINE');
  let envName = readHarnessEnv('ENV', 'dev');
  let stageIds;
  let headed = false;
  let inputPath;
  let inputParamsRaw = readHarnessEnv('INPUT_PARAMS');
  let dataVariant = readHarnessEnv('DATA_VARIANT');
  let runId = readHarnessEnv('RUN_ID');
  const projectOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--headed') {
      headed = true;
    } else if (arg === '--headless') {
      headed = false;
    } else if (arg === '--env') {
      envName = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--env=')) {
      envName = arg.slice('--env='.length);
    } else if (arg === '--module') {
      moduleId = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--module=')) {
      moduleId = arg.slice('--module='.length);
    } else if (arg === '--pipeline') {
      pipelineId = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--pipeline=')) {
      pipelineId = arg.slice('--pipeline='.length);
    } else if (arg === '--stages') {
      stageIds = parseStageIds(requireValue(args, index));
      index += 1;
    } else if (arg.startsWith('--stages=')) {
      stageIds = parseStageIds(arg.slice('--stages='.length));
    } else if (arg === '--input') {
      inputPath = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--input=')) {
      inputPath = arg.slice('--input='.length);
    } else if (arg === '--input-params' || arg === '--data-params') {
      inputParamsRaw = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--input-params=')) {
      inputParamsRaw = arg.slice('--input-params='.length);
    } else if (arg.startsWith('--data-params=')) {
      inputParamsRaw = arg.slice('--data-params='.length);
    } else if (arg === '--data-variant') {
      dataVariant = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--data-variant=')) {
      dataVariant = arg.slice('--data-variant='.length);
    } else if (arg === '--run-id') {
      runId = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--run-id=')) {
      runId = arg.slice('--run-id='.length);
    } else if (arg.startsWith('-')) {
      const parsed = parseProjectOption(args, index);
      projectOptions[parsed.key] = parsed.value;
      index = parsed.index;
    } else {
      pipelineId = arg;
    }
  }

  return {
    moduleId,
    pipelineId,
    envName,
    stageIds,
    headed,
    inputPath,
    inputParams: inputParamsRaw ? readJsonArgument(inputParamsRaw) : undefined,
    dataVariant,
    runId,
    projectOptions,
  };
}

function parseRunManyArgs(args) {
  const pipelineIds = [];
  const runArgs = [];
  let delayMs = 0;
  let continueOnFailure = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--pipelines') {
      pipelineIds.push(...parsePipelineIds(requireValue(args, index)));
      index += 1;
    } else if (arg.startsWith('--pipelines=')) {
      pipelineIds.push(...parsePipelineIds(arg.slice('--pipelines='.length)));
    } else if (arg === '--delay') {
      delayMs = parseDelaySeconds(requireValue(args, index));
      index += 1;
    } else if (arg.startsWith('--delay=')) {
      delayMs = parseDelaySeconds(arg.slice('--delay='.length));
    } else if (arg === '--delay-ms') {
      delayMs = parseDelayMs(requireValue(args, index));
      index += 1;
    } else if (arg.startsWith('--delay-ms=')) {
      delayMs = parseDelayMs(arg.slice('--delay-ms='.length));
    } else if (arg === '--continue-on-failure') {
      continueOnFailure = true;
    } else if (arg === '--stop-on-failure') {
      continueOnFailure = false;
    } else if (arg.startsWith('-')) {
      runArgs.push(arg);
      if (!arg.includes('=') && shouldCopyOptionValue(args, index)) {
        runArgs.push(args[index + 1]);
        index += 1;
      }
    } else {
      pipelineIds.push(...parsePipelineIds(arg));
    }
  }

  if (pipelineIds.length === 0) {
    throw new Error(
      'Usage: pnpm regressionwright run-many <pipeline-id>... [--env <env-name>] [--headed]\n' +
        '   or: pnpm regressionwright run-many --pipelines <pipeline-id>,<pipeline-id> [--env <env-name>] [--headed]'
    );
  }

  return {
    pipelineIds,
    runArgs,
    delayMs,
    continueOnFailure,
  };
}

function parseResumeArgs(args) {
  let target;
  let fromStage;
  let envName;
  let headed = false;
  const projectOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--headed') {
      headed = true;
    } else if (arg === '--headless') {
      headed = false;
    } else if (arg === '--from') {
      fromStage = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--from=')) {
      fromStage = arg.slice('--from='.length);
    } else if (arg === '--env') {
      envName = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--env=')) {
      envName = arg.slice('--env='.length);
    } else if (arg.startsWith('-')) {
      const parsed = parseProjectOption(args, index);
      projectOptions[parsed.key] = parsed.value;
      index = parsed.index;
    } else {
      target = arg;
    }
  }

  return {
    target,
    fromStage,
    envName,
    headed,
    projectOptions,
  };
}

function readJsonArgument(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) {
    return {
      value: JSON.parse(trimmed),
      source: 'inline-json',
    };
  }

  const resolved = resolveFromProjectRoot(trimmed);
  return {
    value: readJson(resolved),
    source: resolved,
  };
}

function classifyRun(params) {
  if (params.failedCheckpoint) {
    if (params.failedCheckpoint.error?.code) {
      return {
        status: 'failed',
        classification: categoryForCode(params.failedCheckpoint.error.code),
        reason: params.failedCheckpoint.error.message,
        errorCode: params.failedCheckpoint.error.code,
      };
    }

    const notes = params.failedCheckpoint.notes || '';
    if (/SSO|auth|login|microsoftonline|AUTH/i.test(notes)) {
      return {
        status: 'failed',
        classification: 'env_issue',
        reason: 'Authentication requires refresh or interactive login.',
      };
    }
    if (/Executable doesn't exist|playwright install|browserType\.launch/i.test(notes)) {
      return {
        status: 'failed',
        classification: 'env_issue',
        reason: 'Playwright browser binary is missing.',
      };
    }
    if (/static assets|\/assets\/.*\.js|chunk|CDN/i.test(notes)) {
      return {
        status: 'failed',
        classification: 'env_issue',
        reason: 'Application static assets appear unavailable or stale.',
      };
    }
    if (/locator|selector|toBeVisible|Cannot find visible|Timeout|waiting for/i.test(notes)) {
      return {
        status: 'failed',
        classification: 'script_issue',
        reason: 'Stage likely failed due to selector, timing, or test data mismatch.',
      };
    }
    if (/Schema validation failed/i.test(notes)) {
      return {
        status: 'failed',
        classification: 'script_issue',
        reason: 'Stage input or output did not satisfy its contract schema.',
      };
    }
    return {
      status: 'failed',
      classification: 'unknown',
      reason: notes || 'Stage failed without a classified error.',
    };
  }

  if (params.plannedStageIds.length > 0 && params.plannedStageIds.every(stageId => params.passedStageIds.includes(stageId))) {
    return {
      status: 'passed',
      classification: 'passed',
      reason: 'All planned stages passed.',
    };
  }

  return {
    status: 'incomplete',
    classification: 'unknown',
    reason: 'No failed checkpoint found, but not all planned stages are marked passed.',
  };
}

function plannedCheckpointIds(plan) {
  const nodeIds = plan?.pipeline?.nodes
    ?.filter(node => node.type === 'stage')
    .map(node => node.id)
    .filter(Boolean) ?? [];
  if (nodeIds.length > 0) {
    return nodeIds;
  }

  return plan?.stages?.map(stage => stage.refId ?? stage.id).filter(Boolean) ?? [];
}

function summarizeStageResults(plan, context) {
  const checkpoints = new Map((context?.checkpoints || []).map(checkpoint => [checkpoint.stageId, checkpoint]));
  const nodes = plannedStageNodes(plan);
  return nodes.map(node => {
    const checkpoint = checkpoints.get(node.id);
    return {
      id: node.id,
      stageId: node.stageId,
      stage: node.stage,
      variant: node.variant,
      actor: node.actor,
      checks: node.checks,
      checkPath: node.checkPath,
      status: checkpoint?.status || 'pending',
      at: checkpoint?.at,
      assertions: checkpoint?.assertions,
      errorCode: checkpoint?.error?.code,
      errorCategory: checkpoint?.error?.category,
    };
  });
}

function plannedStageNodes(plan) {
  const pipelineNodes = plan?.pipeline?.nodes?.filter(node => node.type === 'stage') ?? [];
  if (pipelineNodes.length > 0) {
    return pipelineNodes;
  }

  return (plan?.stages || []).map(stage => ({
    id: stage.refId ?? stage.id,
    stageId: stage.id,
    stage: stage.registry?.stage,
    variant: stage.registry?.variant,
    actor: stage.registry?.actor,
    checks: stage.registry?.checks,
    checkPath: stage.registry?.checkPath,
  }));
}

function parseStageIds(value) {
  const stages = value
    .split(',')
    .map(stage => stage.trim())
    .filter(Boolean);
  if (stages.length === 0) {
    throw new Error('--stages requires at least one stage id.');
  }
  return stages;
}

function parsePipelineIds(value) {
  const pipelineIds = value
    .split(',')
    .map(pipelineId => pipelineId.trim())
    .filter(Boolean);
  if (pipelineIds.length === 0) {
    throw new Error('--pipelines requires at least one pipeline id.');
  }
  return pipelineIds;
}

function parseDelaySeconds(value) {
  return parseNonNegativeNumber(value, '--delay') * 1000;
}

function parseDelayMs(value) {
  return parseNonNegativeNumber(value, '--delay-ms');
}

function parseNonNegativeNumber(value, optionName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${optionName} requires a non-negative number.`);
  }
  return parsed;
}

function shouldCopyOptionValue(args, index) {
  const nextValue = args[index + 1];
  if (!nextValue || nextValue.startsWith('-')) {
    return false;
  }

  const arg = args[index];
  if (arg === '--headed' || arg === '--headless') {
    return false;
  }
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDelay(ms) {
  if (ms % 1000 === 0) {
    return `${ms / 1000}s`;
  }
  return `${ms}ms`;
}

function requireValue(args, index) {
  const value = args[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`Option ${args[index]} requires a value.`);
  }
  return value;
}

function parseProjectOption(args, index) {
  const arg = args[index];
  const equalIndex = arg.indexOf('=');
  const rawKey = equalIndex === -1 ? arg.slice(2) : arg.slice(2, equalIndex);
  if (!rawKey) {
    throw new Error(`Unknown option: ${arg}`);
  }

  if (equalIndex !== -1) {
    return {
      key: camelCaseOptionKey(rawKey),
      value: arg.slice(equalIndex + 1),
      index,
    };
  }

  const nextValue = args[index + 1];
  if (!nextValue || nextValue.startsWith('-')) {
    return {
      key: camelCaseOptionKey(rawKey),
      value: true,
      index,
    };
  }

  return {
    key: camelCaseOptionKey(rawKey),
    value: nextValue,
    index: index + 1,
  };
}

function parseRegistryArgs(args) {
  let moduleId = defaultModuleId();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--module') {
      moduleId = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--module=')) {
      moduleId = arg.slice('--module='.length);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      moduleId = arg;
    }
  }

  return { moduleId };
}

function parseAiParamsContextArgs(args) {
  let moduleId = defaultModuleId();
  let pipelineId = readHarnessEnv('PIPELINE');
  let envName = readHarnessEnv('ENV', 'dev');
  let stageIds;
  let dataVariant = readHarnessEnv('DATA_VARIANT');
  let runId = readHarnessEnv('RUN_ID');
  let mode = 'ai-generated-daily';
  const projectOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--env') {
      envName = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--env=')) {
      envName = arg.slice('--env='.length);
    } else if (arg === '--module') {
      moduleId = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--module=')) {
      moduleId = arg.slice('--module='.length);
    } else if (arg === '--pipeline') {
      pipelineId = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--pipeline=')) {
      pipelineId = arg.slice('--pipeline='.length);
    } else if (arg === '--stages') {
      stageIds = parseStageIds(requireValue(args, index));
      index += 1;
    } else if (arg.startsWith('--stages=')) {
      stageIds = parseStageIds(arg.slice('--stages='.length));
    } else if (arg === '--data-variant') {
      dataVariant = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--data-variant=')) {
      dataVariant = arg.slice('--data-variant='.length);
    } else if (arg === '--mode') {
      mode = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--mode=')) {
      mode = arg.slice('--mode='.length);
    } else if (arg === '--run-id') {
      runId = requireValue(args, index);
      index += 1;
    } else if (arg.startsWith('--run-id=')) {
      runId = arg.slice('--run-id='.length);
    } else if (arg.startsWith('-')) {
      const parsed = parseProjectOption(args, index);
      projectOptions[parsed.key] = parsed.value;
      index = parsed.index;
    } else {
      pipelineId = arg;
    }
  }

  return {
    moduleId,
    pipelineId,
    envName,
    stageIds,
    dataVariant,
    runId,
    mode,
    projectOptions,
  };
}

async function printHelp() {
  const adapter = await loadProjectHarnessAdapter(defaultModuleId());
  const examples = adapter.helpExamples?.() || [
    '  pnpm regressionwright run <pipeline-id> --headed',
    '  pnpm regressionwright daily <pipeline-id>',
    '  pnpm regressionwright resume artifacts/runs/<pipeline-id>/REG-...',
    '  pnpm regressionwright registry <module-id>',
    '  pnpm regressionwright diagnose artifacts/runs/<pipeline-id>/REG-...',
  ];

  console.log(`Usage:
  pnpm regressionwright run [pipeline-id] [--module <module-id>] [--headed]
  pnpm regressionwright run-many <pipeline-id>... [--module <module-id>] [--headed]
  pnpm regressionwright run-many --pipelines <pipeline-id>,<pipeline-id> [--module <module-id>] [--headed]
  pnpm regressionwright daily [pipeline-id] [--module <module-id>]
  pnpm regressionwright resume <run-dir-or-run-context-path> [--from <stage-ref>] [--headed]
  pnpm regressionwright registry [module-id]
  pnpm regressionwright diagnose <run-dir-or-run-context-path>
  pnpm regressionwright ai-params-context [pipeline-id] [--module <module-id>] [--env <env-name>]
  pnpm regressionwright integration install <codex|claude|all>
  pnpm regressionwright --integration <codex|claude|all>
  pnpm regressionwright auth [--module <module-id>]
  pnpm regressionwright profile [--module <module-id>]

Examples:
${examples.join('\n')}
`);
}

function printIntegrationHelp() {
  console.log(`Usage:
  pnpm regressionwright integration list
  pnpm regressionwright integration install <codex|claude|all>
  pnpm regressionwright --integration <codex|claude|all>

Installs the package-owned regressionwright skill into this regression
project only. It does not write user-level AI configuration.
`);
}
