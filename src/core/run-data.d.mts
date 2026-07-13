export type StageContract = {
  schemaVersion: 1;
  id: string;
  module: string;
  name: string;
  description: string;
  executor: string;
  mode: string;
  requires: string[];
  produces: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  errorSchema: Record<string, unknown>;
  sideEffects: string[];
  evidence: string[];
};

export type StageCheckSet = {
  schemaVersion: 1;
  id: string;
  module: string;
  stage: string;
  checks: string;
  description?: string;
  outputSchema?: Record<string, unknown>;
};

export type StageRegistryEntry = {
  id: string;
  stage?: string;
  dataKey?: string;
  dataKeys?: string[];
  variant?: string;
  defaultInput?: string;
  inputPath?: string;
  defaultChecks?: string;
  contractPath: string;
  implementationPath: string;
  executor: {
    type: string;
    specPath?: string;
    registryPath?: string;
  };
  tags: string[];
  status: string;
};

export type StageDefinition = StageRegistryEntry & {
  module: string;
};

export type StageRegistry = {
  schemaVersion: 1;
  module: string;
  description: string;
  stageDefinitions?: string[];
  stages: StageRegistryEntry[];
};

export type RegressionPipelineDefinition = {
  id: string;
  name: string;
  module: string;
  stages: Array<{
    id?: string;
    ref?: string;
    refId?: string;
    stage?: string;
    variant?: string;
    actor?: string;
    input?: string;
    inputPath?: string;
    dates?: string;
    checks?: string;
    name?: string;
    resumeBoundary?: boolean;
    pipelineDefault?: boolean;
  }>;
  envContract?: Record<string, unknown>;
};

export type RegressionPipelinePlan = {
  schemaVersion: 1;
  id: string;
  name: string;
  source: 'pipeline' | 'stages' | 'resume';
  context: {
    scope: 'pipeline';
    artifact: 'run-context.json';
  };
  nodes: Array<
    | {
        id: 'generate-input';
        type: 'data';
        executor: 'module-data-generator';
        module: string;
        produces: string[];
      }
    | {
        id: string;
        type: 'stage';
        stageId: string;
        stage?: string;
        dataKey?: string;
        dataKeys?: string[];
        variant?: string;
        actor?: string;
        input?: string;
        inputPath?: string;
        resumeBoundary?: boolean;
        dates?: string;
        checks?: string;
        checkPath?: string;
        order: number;
        executor: StageDefinition['executor'];
        requires: string[];
        produces: string[];
      }
  >;
};

export type RegressionPlan = {
  schemaVersion: 1;
  runId: string;
  pipelineId: string;
  module: string;
  envName: string;
  mode: 'run' | 'resume';
  source: 'pipeline' | 'stages' | 'resume';
  createdAt: string;
  pipeline: RegressionPipelinePlan;
  stages: Array<{
    id: string;
    refId?: string;
    module: string;
    name: string;
    registry: {
      stage?: string;
      dataKey?: string;
      dataKeys?: string[];
      variant?: string;
      actor?: string;
      input?: string;
      inputPath?: string;
      resumeBoundary?: boolean;
      defaultInput?: string;
      dates?: string;
      checks?: string;
      checkPath?: string;
      contractPath: string;
      implementationPath: string;
      executor: StageDefinition['executor'];
      tags: string[];
      status: string;
    };
    contract: StageContract;
    checks?: StageCheckSet;
  }>;
};

export const consumerProjectRoot: string;
export const harnessPackageRoot: string;
export const projectRoot: string;
export function resolveFromHarnessPackageRoot(value: string): string;
export function createRunId(date?: Date): string;
export function runDirFor(pipelineId: string, runId: string): string;
export function runFilesFor(
  pipelineId: string,
  runId: string,
  runDir?: string
): {
  runDir: string;
  planPath: string;
  inputPath: string;
  contextPath: string;
  summaryPath: string;
};
export function loadPipeline(pipelineId: string): RegressionPipelineDefinition;
export function loadStageRegistry(moduleId: string): StageRegistry;
export function loadStageDefinition(moduleId: string, stageId: string): StageDefinition;
export function loadStageContract(moduleId: string, stageId: string): StageContract;
export function loadStageChecks(moduleId: string, stageName: string, checksId: string): StageCheckSet;
export function listStageChecks(moduleId: string, stageName?: string): Array<{
  id: string;
  path: string;
  description?: string;
}>;
export function loadDataTemplate(templateId: string): Record<string, unknown>;
export function loadDateSet(moduleId: string, dateSetId: string): Record<string, unknown>;
export function loadEnvConfig<TEnv extends Record<string, unknown> = Record<string, unknown>>(
  envName: string
): TEnv & { name: string };
export function createRegressionPlan(params: {
  pipelineId: string;
  runId: string;
  envName: string;
  stageIds?: string[];
}): RegressionPlan;
export function createRegressionInput(params: {
  pipelineId: string;
  runId: string;
  envName: string;
  env: ReturnType<typeof loadEnvConfig>;
  dataVariant?: string;
  stageIds?: string[];
  runtimeInput?: Record<string, unknown>;
}): Promise<Record<string, unknown>>;
export function applyInputParams<T extends Record<string, unknown>>(
  input: T,
  params: Record<string, unknown>,
  metadata?: { source?: string }
): T;
export function createStageRegistrySummary(moduleId: string): {
  schemaVersion: 1;
  module: string;
  description: string;
  pipelines: Array<{
    id: string;
    name: string;
    description?: string;
    stages: string[];
    stageRefs: string[];
    stageInputs: Array<{
      refId: string;
      stageId: string;
      stage: string;
      dataKey: string;
      dataKeys: string[];
      variant?: string;
      actor?: string;
      input?: string;
      inputPath?: string;
      dates?: string;
      checks?: string;
      checkPath?: string;
    }>;
    defaultStages: string[];
  }>;
  stages: Array<{
    id: string;
    module: string;
    name: string;
    description: string;
    stage?: string;
    dataKey?: string;
    dataKeys?: string[];
    variant?: string;
    defaultInput?: string;
    inputPath?: string;
    defaultChecks?: string;
    availableChecks: Array<{
      id: string;
      path: string;
      description?: string;
    }>;
    executor: StageDefinition['executor'];
    status: string;
    tags: string[];
    contractPath: string;
    implementationPath: string;
    requires: string[];
    produces: string[];
    sideEffects: string[];
  }>;
};
export function readJson<T = unknown>(filePath: string): T;
export function writeJson(filePath: string, value: unknown): void;
export function resolveFromProjectRoot(value: string): string;
