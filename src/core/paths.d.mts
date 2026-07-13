export const harnessPackageRoot: string;
export const consumerProjectRoot: string;
export function resolveFromProjectRoot(value: string): string;
export function resolveFromHarnessPackageRoot(value: string): string;
export function projectPath(...segments: string[]): string;
export function harnessPackagePath(...segments: string[]): string;
