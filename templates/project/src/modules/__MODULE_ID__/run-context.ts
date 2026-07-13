export type ProjectRunInput = {
  schemaVersion: 1;
  module: '__MODULE_ID__';
  data?: {
    site?: string;
  };
  healthCheck: {
    baseUrl: string;
    expectedTitleContains: string;
  };
};

export type ProjectRunContext = {
  pipelineId: string;
  envName: string;
  runId: string;
  startedAt: string;
  artifacts: {
    runDir: string;
  };
  plan: Record<string, unknown>;
  input: ProjectRunInput;
  state: {
    healthCheck?: {
      checked: boolean;
      title: string;
      url: string;
    };
    contentChecks?: Record<string, {
      checked: boolean;
      matchedText: string;
      matchedLinkText?: string;
    }>;
    summaryCheck?: {
      checked: boolean;
      siteUrl: string;
      contentChecksPassed: number;
    };
  };
  checkpoints: Array<Record<string, unknown>>;
};
