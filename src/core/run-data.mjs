import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  consumerProjectRoot,
  harnessPackageRoot,
  projectPath,
  resolveFromHarnessPackageRoot,
  resolveFromProjectRoot,
} from './paths.mjs';

export {
  consumerProjectRoot,
  harnessPackageRoot,
  resolveFromHarnessPackageRoot,
  resolveFromProjectRoot,
};

export const projectRoot = consumerProjectRoot;

export function createRunId(date = new Date()) {
  return `REG-${formatTimestamp(date)}`;
}

export function runDirFor(pipelineId, runId) {
  return projectPath('artifacts', 'runs', pipelineId, runId);
}

export function runFilesFor(pipelineId, runId, runDir = runDirFor(pipelineId, runId)) {
  return {
    runDir,
    planPath: path.join(runDir, 'plan.json'),
    inputPath: path.join(runDir, 'input.json'),
    contextPath: path.join(runDir, 'run-context.json'),
    summaryPath: path.join(runDir, 'summary.json'),
  };
}

export function loadPipeline(pipelineId) {
  const pipelinePath = findDefinitionFile('pipelines', pipelineId);
  return readJson(pipelinePath);
}

export function loadStageRegistry(moduleId) {
  const registry = readJson(projectPath('stage-registry', `${moduleId}.json`));
  if (registry.stages) {
    return registry;
  }

  const stageDefinitions = registry.stageDefinitions || [];
  return {
    ...registry,
    stages: stageDefinitions.map(definitionPath => readJson(resolveFromProjectRoot(definitionPath))),
  };
}

export function loadStageDefinition(moduleId, stageId) {
  const registry = loadStageRegistry(moduleId);
  const definition = registry.stages?.find(stage => stage.id === stageId);
  if (!definition) {
    throw new Error(`Unknown stage "${stageId}" for module "${moduleId}".`);
  }
  return {
    module: registry.module,
    ...definition,
  };
}

export function loadStageContract(moduleId, stageId) {
  const stage = loadStageDefinition(moduleId, stageId);
  const contract = readJson(resolveFromProjectRoot(stage.contractPath));
  validateStageDefinitionContract(stage, contract);
  return contract;
}

export function loadStageChecks(moduleId, stageName, checksId) {
  const checks = readJson(projectPath('checks', moduleId, stageName, `${checksId}.json`));
  validateStageChecks(moduleId, stageName, checksId, checks);
  return checks;
}

export function listStageChecks(moduleId, stageName) {
  if (!stageName) {
    return [];
  }

  const checksDir = projectPath('checks', moduleId, stageName);
  if (!fs.existsSync(checksDir)) {
    return [];
  }

  return findJsonFiles(checksDir).sort().map(filePath => {
    const checksId = path.basename(filePath, '.json');
    const checks = readJson(filePath);
    validateStageChecks(moduleId, stageName, checksId, checks);
    return {
      id: checksId,
      path: path.relative(consumerProjectRoot, filePath),
      description: checks.description,
    };
  });
}

export function loadEnvConfig(envName) {
  return readJson(projectPath('config', `${envName}.json`));
}

export function loadDataTemplate(templateId) {
  const template = readJson(projectPath('data-templates', `${templateId}.json`));
  return expandDataTemplate(template);
}

export function createRegressionPlan(params) {
  const pipeline = loadPipeline(params.pipelineId);
  const pipelineStages = withPipelineStageInstanceRefs(
    pipeline.module,
    pipeline.stages.map(stage => ({
      ...stage,
      id: resolvePipelineStageId(pipeline.module, stage),
    }))
  );
  const requestedPipelineStages = selectPipelineStagesForPlan(pipeline, pipelineStages, params.stageIds);
  const stages = requestedPipelineStages.map(pipelineStage => {
    const stageId = pipelineStage.id;
    const stageDefinition = loadStageDefinition(pipeline.module, stageId);
    const contract = loadStageContract(pipeline.module, stageId);
    const stageInput = stageInputRefForPipelineStage(pipeline.module, pipelineStage);
    const stageChecks = stageChecksForPipelineStage(pipeline.module, pipelineStage, stageDefinition);
    return {
      id: pipelineStage.id,
      refId: stageRefIdForPipelineStage(pipeline.module, pipelineStage),
      module: stageDefinition.module,
      name: contract.name || pipelineStage.name,
      registry: {
        stage: stageNameForStageDefinition(stageDefinition),
        dataKey: stageDataKeyForStageDefinition(stageDefinition),
        dataKeys: stageDataKeysForStageDefinition(stageDefinition),
        variant: stageDefinition.variant,
      actor: pipelineStage.actor,
      input: stageInput?.input,
      inputPath: stageInput?.inputPath,
      resumeBoundary: Boolean(pipelineStage.resumeBoundary),
      defaultInput: stageDefinition.defaultInput,
      checks: stageChecks?.id,
        checkPath: stageChecks?.path,
        dates: pipelineStage.dates,
        contractPath: stageDefinition.contractPath,
        implementationPath: stageDefinition.implementationPath,
        executor: stageDefinition.executor,
        tags: stageDefinition.tags || [],
        status: stageDefinition.status,
      },
      contract,
      checks: stageChecks?.definition,
    };
  });

  validateStageSequence(stages);

  return {
    schemaVersion: 1,
    runId: params.runId,
    pipelineId: pipeline.id,
    module: pipeline.module,
    envName: params.envName,
    mode: 'run',
    source: params.stageIds?.length ? 'stages' : 'pipeline',
    createdAt: new Date().toISOString(),
    pipeline: createPipelinePlan({
      pipeline,
      stages,
      source: params.stageIds?.length ? 'stages' : 'pipeline',
    }),
    stages,
  };
}

export async function createRegressionInput(params) {
  const pipeline = loadPipeline(params.pipelineId);
  const dataGenerator = await loadDataGenerator(pipeline);

  return dataGenerator({
    ...params,
    pipeline,
    stageIds: params.stageIds,
  });
}

export function applyInputParams(input, params, metadata = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new Error('Input params must be a JSON object.');
  }

  const merged = deepMerge(input, params);
  const synced = syncStageInputsWithTopLevelInput(merged, params.stageInputs);
  return {
    ...synced,
    data: {
      ...(input.data || {}),
      ...(synced.data || {}),
      inputParams: {
        applied: true,
        source: metadata.source || 'external',
        topLevelKeys: Object.keys(params),
      },
    },
  };
}

function syncStageInputsWithTopLevelInput(input, explicitStageInputs) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }
  if (!input.stageInputs || typeof input.stageInputs !== 'object' || Array.isArray(input.stageInputs)) {
    return input;
  }

  const stageInputs = Object.fromEntries(
    Object.entries(input.stageInputs).map(([refId, entry]) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [refId, entry];
      }
      const explicitEntry = explicitStageInputs?.[refId];
      if (explicitEntry && typeof explicitEntry === 'object' && 'value' in explicitEntry) {
        return [refId, entry];
      }

      const dataKeys = stageInputDataKeys(entry);
      if (dataKeys.length === 0) {
        return [refId, entry];
      }

      return [
        refId,
        {
          ...entry,
          value: stageInputValueFromTopLevel(input, entry.value, dataKeys),
        },
      ];
    })
  );

  return {
    ...input,
    stageInputs,
  };
}

function stageInputDataKeys(entry) {
  if (Array.isArray(entry.dataKeys) && entry.dataKeys.length > 0) {
    return entry.dataKeys.filter(Boolean);
  }
  if (entry.dataKey) {
    return [entry.dataKey];
  }
  return [];
}

function stageInputValueFromTopLevel(input, currentValue, dataKeys) {
  if (dataKeys.length === 1) {
    return Object.prototype.hasOwnProperty.call(input, dataKeys[0]) ? input[dataKeys[0]] : currentValue || {};
  }

  const currentObject = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
    ? currentValue
    : {};
  return Object.fromEntries(
    dataKeys.map(dataKey => [
      dataKey,
      Object.prototype.hasOwnProperty.call(input, dataKey) ? input[dataKey] : currentObject[dataKey] || {},
    ])
  );
}

async function loadDataGenerator(pipeline) {
  const modulePath = resolveFromProjectRoot(path.join('src', 'modules', pipeline.module, 'run-data.mjs'));
  const module = await import(pathToFileURL(modulePath).href);
  if (typeof module.createRegressionInput !== 'function') {
    throw new Error(
      `Module "${pipeline.module}" must export createRegressionInput(params) from src/modules/${pipeline.module}/run-data.mjs.`
    );
  }
  return module.createRegressionInput;
}

function selectPipelineStagesForPlan(pipeline, pipelineStages, stageIds) {
  if (!stageIds?.length) {
    return pipelineStages.filter(stage => stage.pipelineDefault !== false);
  }

  return stageIds.map(stageRequest => selectPipelineStage(pipeline, pipelineStages, stageRequest));
}

function createPipelinePlan(params) {
  return {
    schemaVersion: 1,
    id: params.pipeline.id,
    name: params.pipeline.name,
    source: params.source,
    context: {
      scope: 'pipeline',
      artifact: 'run-context.json',
    },
    nodes: [
      {
        id: 'generate-input',
        type: 'data',
        executor: 'module-data-generator',
        module: params.pipeline.module,
        produces: ['input.json'],
      },
      ...params.stages.map((stage, index) => ({
        id: stage.refId,
        type: 'stage',
        stageId: stage.id,
        stage: stage.registry.stage,
        dataKey: stage.registry.dataKey,
        dataKeys: stage.registry.dataKeys,
        variant: stage.registry.variant,
        actor: stage.registry.actor,
        input: stage.registry.input,
        inputPath: stage.registry.inputPath,
        resumeBoundary: stage.registry.resumeBoundary,
        checks: stage.registry.checks,
        checkPath: stage.registry.checkPath,
        dates: stage.registry.dates,
        order: index + 1,
        executor: stage.registry.executor,
        requires: stage.contract.requires || [],
        produces: stage.contract.produces || [],
      })),
    ],
  };
}

export function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    throw new Error(`Cannot read JSON because ${filePath} is empty or corrupted.`);
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Cannot read JSON because ${filePath} is empty or corrupted. ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function findDefinitionFile(baseDirectory, definitionId) {
  const directPath = projectPath(baseDirectory, `${definitionId}.json`);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const matches = findJsonFiles(projectPath(baseDirectory))
    .filter(filePath => readJson(filePath).id === definitionId);
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    throw new Error(`Definition "${definitionId}" is ambiguous under ${baseDirectory}: ${matches.join(', ')}`);
  }

  throw new Error(`Cannot find definition "${definitionId}" under ${baseDirectory}.`);
}

function findJsonFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findJsonFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
  });
}

export function createStageRegistrySummary(moduleId) {
  const registry = loadStageRegistry(moduleId);
  const stages = (registry.stages || []).map(stage => {
    const contract = loadStageContract(moduleId, stage.id);
    const stageName = stageNameForStageDefinition(stage);
    return {
      id: stage.id,
      module: registry.module,
      name: contract.name,
      description: contract.description,
      stage: stageName,
      dataKey: stageDataKeyForStageDefinition(stage),
      dataKeys: stageDataKeysForStageDefinition(stage),
      variant: stage.variant,
      executor: stage.executor,
      status: stage.status,
      tags: stage.tags || [],
      contractPath: stage.contractPath,
      implementationPath: stage.implementationPath,
      defaultInput: stage.defaultInput,
      inputPath: stage.inputPath,
      defaultChecks: stage.defaultChecks,
      availableChecks: listStageChecks(moduleId, stageName),
      requires: contract.requires || [],
      produces: contract.produces || [],
      sideEffects: contract.sideEffects || [],
    };
  });

  return {
    schemaVersion: 1,
    module: registry.module,
    description: registry.description,
    pipelines: listPipelinesForModule(moduleId),
    stages,
  };
}

function validateStageSequence(stages) {
  const available = new Set();

  for (const stage of stages) {
    const missing = (stage.contract.requires || []).filter(requirement => !isRequirementSatisfied(requirement, available));
    if (missing.length > 0) {
      throw new Error(
        `Stage "${stage.id}" is missing required prior outputs: ${missing.join(', ')}. ` +
          `Choose earlier stages that produce them, or start from a supported context-loading stage.`
      );
    }

    for (const produced of stage.contract.produces || []) {
      available.add(produced);
      if (produced.includes('=')) {
        available.add(produced.split('=')[0]);
      }
    }
  }
}

function isRequirementSatisfied(requirement, available) {
  if (requirement.startsWith('input.')) {
    return true;
  }
  return available.has(requirement);
}

function validateStageDefinitionContract(stage, contract) {
  if (contract.id !== stage.id) {
    throw new Error(
      `Stage registry entry "${stage.id}" points to contract "${contract.id}". The ids must match.`
    );
  }
  if (contract.module !== stage.module) {
    throw new Error(
      `Stage registry entry "${stage.id}" is in module "${stage.module}", but contract declares "${contract.module}".`
    );
  }
  validateSchemaKeywords(contract.inputSchema, `contract "${contract.id}" inputSchema`);
  validateSchemaKeywords(contract.outputSchema, `contract "${contract.id}" outputSchema`);
  validateSchemaKeywords(contract.errorSchema, `contract "${contract.id}" errorSchema`);
}

function listPipelinesForModule(moduleId) {
  const pipelinesDir = projectPath('pipelines');
  if (!fs.existsSync(pipelinesDir)) {
    return [];
  }

  return findJsonFiles(pipelinesDir)
    .map(filePath => readJson(filePath))
    .filter(pipeline => pipeline.module === moduleId)
    .map(pipeline => {
      const pipelineStages = withPipelineStageInstanceRefs(
        pipeline.module,
        pipeline.stages.map(stage => ({
          ...stage,
          id: resolvePipelineStageId(pipeline.module, stage),
        }))
      );
      return {
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        stages: pipelineStages.map(stage => stage.id),
        stageRefs: pipelineStages.map(stage => stage.refId),
        stageInputs: collectStageInputRefs(pipeline),
        defaultStages: pipelineStages
          .filter(stage => stage.pipelineDefault !== false)
          .map(stage => stage.id),
      };
    });
}

function resolvePipelineStageId(moduleId, pipelineStage) {
  if (pipelineStage.id) {
    return pipelineStage.id;
  }

  const stageName = stageNameForPipelineStage(pipelineStage);
  const variant = pipelineStage.variant;
  if (!stageName || !variant) {
    throw new Error(`Pipeline stage must declare either id or stage+variant: ${JSON.stringify(pipelineStage)}`);
  }

  const registry = loadStageRegistry(moduleId);
  const matches = registry.stages.filter(stage => stageNameForStageDefinition(stage) === stageName && stage.variant === variant);
  if (matches.length === 1) {
    return matches[0].id;
  }
  if (matches.length > 1) {
    throw new Error(`Stage reference "${stageName}/${variant}" is ambiguous for module "${moduleId}".`);
  }

  throw new Error(`Unknown stage reference "${stageName}/${variant}" for module "${moduleId}".`);
}

function stageRefIdForPipelineStage(moduleId, pipelineStage) {
  return pipelineStage.ref || pipelineStage.refId || stageRefForPipelineStage(moduleId, pipelineStage);
}

function withPipelineStageInstanceRefs(moduleId, pipelineStages) {
  const seen = new Map();
  return pipelineStages.map(pipelineStage => {
    if (pipelineStage.ref || pipelineStage.refId) {
      return {
        ...pipelineStage,
        refId: pipelineStage.ref || pipelineStage.refId,
      };
    }

    const baseRef = stageRefForPipelineStage(moduleId, pipelineStage);
    const nextCount = (seen.get(baseRef) || 0) + 1;
    seen.set(baseRef, nextCount);
    return {
      ...pipelineStage,
      refId: nextCount === 1 ? baseRef : `${baseRef}#${nextCount}`,
    };
  });
}

function stageRefForPipelineStage(moduleId, pipelineStage) {
  const actorSuffix = pipelineStage.actor ? `@${pipelineStage.actor}` : '';
  return `${stageBaseRefForPipelineStage(moduleId, pipelineStage)}${actorSuffix}`;
}

function stageBaseRefForPipelineStage(moduleId, pipelineStage) {
  const stageName = stageNameForPipelineStage(pipelineStage);
  if (stageName && pipelineStage.variant) {
    return `${stageName}/${pipelineStage.variant}`;
  }

  const stage = loadStageDefinition(moduleId, pipelineStage.id);
  return `${stageNameForStageDefinition(stage)}/${stage.variant}`;
}

export function loadStageDataDefaults(pipeline, stageIds, options = {}) {
  return collectStageInputRefs(pipeline, stageIds).reduce((defaults, ref) => {
    if (!ref.inputPath) {
      return defaults;
    }

    const dataPath = resolveFromProjectRoot(ref.inputPath);
    if (!fs.existsSync(dataPath)) {
      throw new Error(`Cannot find stage input "${ref.input}" for stage "${ref.stageId}": ${ref.inputPath}`);
    }

    return {
      ...defaults,
      [ref.dataKey]: deepMerge(defaults[ref.dataKey] || {}, applyStageDataProfile(readJson(dataPath), options.dataProfile)),
    };
  }, {});
}

function applyStageDataProfile(stageData, dataProfile) {
  if (!isPlainObject(stageData)) {
    return stageData;
  }
  if (!dataProfile) {
    return omitKeys(stageData, ['profiles']);
  }

  const profile = isPlainObject(stageData.profiles) ? stageData.profiles[dataProfile] : undefined;
  return omitKeys(deepMerge(omitKeys(stageData, ['profiles']), profile || {}), ['profiles']);
}

export function collectStageInputRefs(pipeline, stageIds) {
  return selectPipelineStagesForData(pipeline, stageIds)
    .map(stage => stageInputRefForPipelineStage(pipeline.module, stage))
    .filter(Boolean);
}

function selectPipelineStagesForData(pipeline, stageIds) {
  const pipelineStages = withPipelineStageInstanceRefs(
    pipeline.module,
    pipeline.stages.map(stage => ({
      ...stage,
      id: resolvePipelineStageId(pipeline.module, stage),
    }))
  );

  if (!stageIds?.length) {
    return pipelineStages.filter(stage => stage.pipelineDefault !== false);
  }

  return stageIds.map(stageRequest => selectPipelineStage(pipeline, pipelineStages, stageRequest));
}

function selectPipelineStage(pipeline, pipelineStages, stageRequest) {
  const exactInstanceRef = pipelineStages.find(stage => stage.refId === stageRequest || stage.ref === stageRequest);
  if (exactInstanceRef) {
    return exactInstanceRef;
  }

  const exactStageRef = pipelineStages.find(stage => stageRefForPipelineStage(pipeline.module, stage) === stageRequest);
  if (exactStageRef) {
    return exactStageRef;
  }

  const idMatch = pipelineStages.find(stage => stage.id === stageRequest);
  if (idMatch) {
    return idMatch;
  }

  const baseStageRef = pipelineStages.find(stage => stageBaseRefForPipelineStage(pipeline.module, stage) === stageRequest);
  if (baseStageRef) {
    return baseStageRef;
  }

  throw new Error(`Unknown stage "${stageRequest}" for pipeline "${pipeline.id}".`);
}

function stageInputRefForPipelineStage(moduleId, pipelineStage) {
  const stageId = pipelineStage.id || resolvePipelineStageId(moduleId, pipelineStage);
  const stageDefinition = loadStageDefinition(moduleId, stageId);
  const input = pipelineStage.input || stageDefinition.defaultInput;
  const inputPath = pipelineStage.inputPath || stageDefinition.inputPath;
  const hasDeclaredInputData = Boolean(stageDefinition.dataKey || stageDefinition.dataKeys?.length);

  if (!input && !inputPath && !hasDeclaredInputData) {
    return undefined;
  }

  const stageName = stageNameForStageDefinition(stageDefinition);
  const dataKey = stageDataKeyForStageDefinition(stageDefinition);
  if (!stageName) {
    throw new Error(`Stage "${stageId}" declares stage input but has no stage.`);
  }

  return {
    refId: stageRefIdForPipelineStage(moduleId, pipelineStage),
    stageId,
    stage: stageName,
    dataKey,
    dataKeys: stageDataKeysForStageDefinition(stageDefinition),
    variant: stageDefinition.variant,
    actor: pipelineStage.actor,
        input,
        inputPath: inputPath || (input ? stageInputPathFor(moduleId, stageDefinition, input) : undefined),
        dates: pipelineStage.dates,
        checks: pipelineStage.checks || stageDefinition.defaultChecks,
        resumeBoundary: Boolean(pipelineStage.resumeBoundary),
      };
}

function stageChecksForPipelineStage(moduleId, pipelineStage, stageDefinition) {
  const checksId = pipelineStage.checks || stageDefinition.defaultChecks;
  if (!checksId) {
    return undefined;
  }

  const stageName = stageNameForStageDefinition(stageDefinition);
  if (!stageName) {
    throw new Error(`Stage "${stageDefinition.id}" declares checks but has no stage.`);
  }

  const checkPath = path.join('checks', moduleId, stageName, `${checksId}.json`);
  return {
    id: checksId,
    path: checkPath,
    definition: loadStageChecks(moduleId, stageName, checksId),
  };
}

function stageDataKeyForStageDefinition(stageDefinition) {
  if (stageDefinition.dataKey) {
    return stageDefinition.dataKey;
  }
  if (Array.isArray(stageDefinition.dataKeys) && stageDefinition.dataKeys.length > 0) {
    return stageDefinition.dataKeys[0];
  }
  if (stageDefinition.defaultInput || stageDefinition.inputPath) {
    return stageNameForStageDefinition(stageDefinition);
  }
  return undefined;
}

function stageDataKeysForStageDefinition(stageDefinition) {
  const primaryDataKey = stageDataKeyForStageDefinition(stageDefinition);
  const rawDataKeys = Array.isArray(stageDefinition.dataKeys) ? stageDefinition.dataKeys : [];
  const dataKeys = rawDataKeys.length > 0 ? rawDataKeys : [primaryDataKey];
  return [...new Set(dataKeys.filter(Boolean))];
}

function stageInputPathFor(moduleId, stageDefinition, input) {
  if (!input) {
    throw new Error(`Stage "${stageDefinition.id}" declares stage input without input or inputPath.`);
  }
  return path.join('data-templates', moduleId, 'stage-data', stageNameForStageDefinition(stageDefinition), `${input}.json`);
}

function stageNameForPipelineStage(pipelineStage) {
  return pipelineStage.stage;
}

function stageNameForStageDefinition(stageDefinition) {
  return stageDefinition.stage;
}

function expandDataTemplate(template) {
  return {
    ...template,
    variants: template.variants || readJsonRef(template.variantsPath),
    textTemplates: template.textTemplates || readJsonRef(template.textTemplatesPath),
    defaults: template.defaults || readJsonRef(template.defaultsPath),
    rules: template.rules || readJsonRef(template.rulesPath),
    scenarios: template.scenarios || readJsonRefs(template.scenarioPaths),
  };
}

export function loadDateSet(moduleId, dateSetId) {
  return readJson(projectPath('data-templates', moduleId, 'date-sets', `${dateSetId}.json`));
}

function validateStageChecks(moduleId, stageName, checksId, checks) {
  if (checks.module !== moduleId) {
    throw new Error(`Stage checks "${stageName}/${checksId}" must declare module "${moduleId}".`);
  }
  if (checks.stage !== stageName) {
    throw new Error(`Stage checks "${stageName}/${checksId}" must declare stage "${stageName}".`);
  }
  if (checks.checks !== checksId) {
    throw new Error(`Stage checks "${stageName}/${checksId}" must declare checks "${checksId}".`);
  }
  validateSchemaKeywords(checks.outputSchema, `checks "${stageName}/${checksId}" outputSchema`);
}

const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  'type',
  'required',
  'properties',
  'const',
  'enum',
  'items',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
]);

function validateSchemaKeywords(schema, label, path = '$') {
  if (!schema || typeof schema !== 'object') {
    return;
  }
  if (Array.isArray(schema)) {
    schema.forEach((entry, index) => validateSchemaKeywords(entry, label, `${path}[${index}]`));
    return;
  }

  for (const [key, value] of Object.entries(schema)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      throw new Error(`${label} uses unsupported schema keyword "${key}" at ${path}.`);
    }
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [propertyName, propertySchema] of Object.entries(value)) {
        validateSchemaKeywords(propertySchema, label, `${path}.properties.${propertyName}`);
      }
      continue;
    }
    if (key === 'items') {
      validateSchemaKeywords(value, label, `${path}.items`);
    }
  }
}

function readJsonRef(referencePath) {
  return referencePath ? readJson(resolveFromProjectRoot(referencePath)) : undefined;
}

function readJsonRefs(referencePaths) {
  if (!Array.isArray(referencePaths)) {
    return undefined;
  }
  return referencePaths.map(referencePath => readJson(resolveFromProjectRoot(referencePath)));
}

export function findVariant(template, variantId) {
  const variant = (template.variants || []).find(candidate => candidate.id === variantId);
  if (!variant) {
    throw new Error(`Unknown data variant "${variantId}" for template "${template.id}".`);
  }
  return variant;
}

export function selectScenarios(template, variant) {
  const tags = variant.scenarioTags || [];
  const scenarios = tags.length === 0
    ? template.scenarios
    : template.scenarios.filter(scenario => tags.every(tag => scenario.tags?.includes(tag)));

  if (!scenarios?.length) {
    throw new Error(`Data variant "${variant.id}" does not match any scenario in template "${template.id}".`);
  }

  return scenarios;
}

export function pickFromArray(values, seed) {
  if (!values?.length) {
    throw new Error('Cannot pick from an empty data template array.');
  }
  return values[seed % values.length];
}

export function pickManyFromArray(values, count, seed) {
  if (!values?.length) {
    throw new Error('Cannot pick from an empty data template array.');
  }

  return Array.from({ length: count }, (_value, index) => values[(seed + index) % values.length]);
}

export function mergeRule(base, override) {
  return {
    ...(base || {}),
    ...(override || {}),
  };
}

export function stringListOrFallback(value, fallback) {
  if (Array.isArray(value)) {
    const values = value.map(item => String(item).trim()).filter(Boolean);
    return values.length > 0 ? values : fallback;
  }
  if (value !== undefined && value !== null) {
    const single = String(value).trim();
    return single ? [single] : fallback;
  }
  return fallback;
}

export function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) {
    return override === undefined ? base : override;
  }

  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = deepMerge(base[key], value);
  }
  return result;
}

export function omitKeys(value, keys) {
  const omittedKeys = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omittedKeys.has(key)));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function generateRuleValue(rule, seed) {
  if (rule.type === 'integer') {
    return String(integerInRange(rule.min, rule.max, seed));
  }

  if (rule.type === 'money') {
    return String(steppedNumberInRange(rule.min, rule.max, rule.step || 1, seed));
  }

  throw new Error(`Unsupported data generation rule type "${rule.type}".`);
}

export function generateQuantityValue(rule, seed, style) {
  const base = integerInRange(rule.min, rule.max, seed);

  if (style === 'integer') {
    return String(base);
  }

  if (style === 'oneDecimal') {
    return `${base}.${(seed % 9) + 1}`;
  }

  if (style === 'twoDecimal') {
    const cents = ((seed % 98) + 1);
    return `${base}.${String(cents).padStart(2, '0')}`;
  }

  throw new Error(`Unsupported quantity style "${style}".`);
}

function integerInRange(min, max, seed) {
  const lower = Number(min);
  const upper = Number(max);
  if (!Number.isInteger(lower) || !Number.isInteger(upper) || upper < lower) {
    throw new Error(`Invalid integer generation range: ${min}..${max}.`);
  }
  return lower + (seed % (upper - lower + 1));
}

function steppedNumberInRange(min, max, step, seed) {
  const lower = Number(min);
  const upper = Number(max);
  const increment = Number(step);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(increment) || increment <= 0 || upper < lower) {
    throw new Error(`Invalid stepped generation range: ${min}..${max} step ${step}.`);
  }
  const steps = Math.floor((upper - lower) / increment);
  return lower + (seed % (steps + 1)) * increment;
}

function formatDateOffset(offsetDays, options = {}) {
  const date = new Date();
  date.setDate(date.getDate() + Number(offsetDays));
  date.setHours(options.hour ?? 9, options.minute ?? 0, 0, 0);

  return formatDate(date, options);
}

function formatDateFromNow(offsetMinutes) {
  const date = new Date();
  date.setMinutes(date.getMinutes() + Number(offsetMinutes));
  date.setSeconds(0, 0);

  return formatDate(date);
}

export function formatProfileDate(rule, fallback = {}) {
  if (rule && typeof rule === 'object') {
    if (rule.minutesFromNow !== undefined) {
      return formatDateFromNow(rule.minutesFromNow);
    }
    return formatDateOffset(rule.days ?? fallback.days ?? 0, {
      hour: rule.hour ?? fallback.hour,
      minute: rule.minute ?? fallback.minute,
      dateOnly: rule.dateOnly ?? fallback.dateOnly,
    });
  }

  return formatDateOffset(rule ?? fallback.days ?? 0, fallback);
}

function formatDate(date, options = {}) {
  const pad = value => String(value).padStart(2, '0');
  const datePart = `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;

  if (options.dateOnly) {
    return datePart;
  }

  return `${datePart} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function renderText(template, values) {
  if (typeof template !== 'string') {
    throw new Error('Data template text value must be a string.');
  }

  return String(template).replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, token) => {
    const value = readPath(values, token);
    if (value === undefined || value === null) {
      throw new Error(`Data template references unknown token "${token}".`);
    }
    return String(value);
  });
}

function readPath(value, pathExpression) {
  return pathExpression.split('.').reduce((current, key) => current?.[key], value);
}

export function mixSeed(seed, salt) {
  return hashString(`${seed}:${salt}`);
}

export function hashString(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formatTimestamp(date) {
  const pad = value => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}
