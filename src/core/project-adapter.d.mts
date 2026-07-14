export type ProjectHarnessAdapter = {
  defaultPipelineId?: string;
  executorType?: 'playwright' | 'appium' | 'miniprogram';
  playwrightSpecPath?: string;
  pipelineRunnerModule?: string;
  createRuntimeInput?: (params: { plan: unknown; options: Record<string, unknown> }) => unknown;
  validateRunOptions?: (params: {
    options: Record<string, unknown>;
    projectOptions: Record<string, unknown>;
  }) => void;
  applyRunEnv?: (params: {
    envVars: Record<string, string | undefined>;
    options: Record<string, unknown>;
    plan: unknown;
    runtimeInput: unknown;
  }) => void;
  afterPlaywrightRun?: (params: {
    result: unknown;
    plan: unknown;
    runId: string;
    pipelineId: string;
    runDir: string;
    planPath: string;
    inputPath: string;
    envVars: Record<string, string | undefined>;
  }) => void | Promise<void>;
  afterRun?: (params: {
    result: unknown;
    executorType: 'playwright' | 'appium' | 'miniprogram';
    plan: unknown;
    runId: string;
    pipelineId: string;
    runDir: string;
    planPath: string;
    inputPath: string;
    envVars: Record<string, string | undefined>;
  }) => void | Promise<void>;
  summarizeDiagnose?: (params: { context?: unknown; plan?: unknown; input?: unknown }) => Record<string, unknown>;
  createAiParamsContext?: (params: {
    plan: unknown;
    baseInput: unknown;
    env: unknown;
    options: Record<string, unknown>;
    mode: string;
  }) => Record<string, unknown>;
  helpExamples?: () => string[];
  createAuthSessionConfig?: (params: { envName: string; options: Record<string, unknown> }) => {
    authState: string;
    userDataDir: string;
    url: string;
    introLines?: string[];
    savedMessage?: string;
  };
  waitForAuthReady?: (page: unknown, authConfig?: unknown) => Promise<void>;
  createBrowserProfileConfig?: (params: { envName: string; options: Record<string, unknown> }) => {
    url: string;
    userDataDir: string;
    introLines?: string[];
  };
};

export type HarnessModuleConfig = {
  description?: string;
  adapterPath?: string;
};

export type HarnessConfig = {
  schemaVersion: 1;
  defaultModule?: string;
  modules?: Record<string, HarnessModuleConfig>;
};

export function defaultModuleId(fallback?: string): string | undefined;
export function loadProjectHarnessAdapter(moduleId?: string): Promise<ProjectHarnessAdapter>;
export function loadHarnessConfig(): HarnessConfig | undefined;
export function moduleConfig(moduleId: string): HarnessModuleConfig | undefined;
