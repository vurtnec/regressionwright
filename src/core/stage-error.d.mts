import type { RunContextBase } from './run-context.js';

export type StageErrorCode =
  | 'AUTH_REQUIRED'
  | 'PRECONDITION_FAILED'
  | 'SELECTOR_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'APP_ERROR'
  | 'TIMEOUT'
  | 'ENVIRONMENT_ERROR'
  | 'UNKNOWN';

export type DiagnosisCategory = 'env_issue' | 'planning_error' | 'script_issue' | 'app_bug' | 'unknown';

export type StageErrorEvidence = {
  runDir?: string;
  playwrightOutputDir?: string;
  screenshot?: string;
  trace?: string;
  video?: string;
  url?: string;
  evidenceCollectionError?: string;
};

export type StructuredStageError = {
  code: StageErrorCode;
  category: DiagnosisCategory;
  message: string;
  stageId?: string;
  evidence: StageErrorEvidence;
  originalName?: string;
  stack?: string;
};

export function createStageError(
  error: unknown,
  params?: {
    stageId?: string;
    run?: RunContextBase;
    evidence?: StageErrorEvidence;
  }
): StructuredStageError;
export function categoryForCode(code: StageErrorCode): DiagnosisCategory;
