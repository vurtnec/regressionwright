export type MiniProgramRunInput = {
  schemaVersion: 1;
  module: '__MODULE_ID__';
  miniProgramSession: {
    launchOptions: {
      cliPath?: string;
      projectPath: string;
      timeout: number;
      port?: number;
      trustProject: boolean;
    };
    initialPath: string;
    readySelector: string;
    expectedText?: string;
    readyTimeoutMs: number;
  };
  pageNavigation: {
    clickSelector: string;
    expectedPath: string;
    readySelector: string;
    expectedText?: string;
    timeoutMs: number;
  };
};

export type MiniProgramRunContext = {
  pipelineId: string;
  envName: string;
  runId: string;
  startedAt: string;
  artifacts: { runDir: string };
  plan: Record<string, unknown>;
  input: MiniProgramRunInput;
  state: {
    miniProgramSession?: {
      launched: boolean;
      pagePath: string;
      readySelector: string;
      readyElementVisible: boolean;
      readyText: string;
    };
    pageNavigation?: {
      completed: boolean;
      pagePath: string;
      readyElementVisible: boolean;
      readyText: string;
    };
  };
  checkpoints: Array<Record<string, unknown>>;
};
