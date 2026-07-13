export type AppiumRunInput = {
  schemaVersion: 1;
  module: '__MODULE_ID__';
  appSession: {
    server: {
      protocol?: string;
      hostname: string;
      port: number;
      path: string;
      logLevel?: string;
    };
    capabilities: Record<string, unknown>;
    readyAccessibilityId?: string;
    readyTimeoutMs: number;
  };
};

export type AppiumRunContext = {
  pipelineId: string;
  envName: string;
  runId: string;
  startedAt: string;
  artifacts: { runDir: string };
  plan: Record<string, unknown>;
  input: AppiumRunInput;
  state: {
    appSession?: {
      launched: boolean;
      sessionId: string;
      platformName: string;
      automationName: string;
      readyElementVisible: boolean;
    };
  };
  checkpoints: Array<Record<string, unknown>>;
};
