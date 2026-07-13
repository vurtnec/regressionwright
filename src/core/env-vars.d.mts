export function harnessEnvKey(name: string): string;
export function readHarnessEnv(name: string): string | undefined;
export function readHarnessEnv(name: string, defaultValue: string): string;
export function readHarnessEnvNumber(name: string, defaultValue: number): number;
export function readHarnessEnvList(name: string): string[] | undefined;
export function setHarnessEnv(
  envVars: Record<string, string | undefined>,
  name: string,
  value: unknown
): string | undefined;
export function syncHarnessEnv(
  envVars: Record<string, string | undefined>,
  name: string,
  defaultValue?: unknown
): string | undefined;
