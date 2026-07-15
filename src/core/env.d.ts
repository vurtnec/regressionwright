import { resolveFromProjectRoot } from './paths.mjs';
export type RegressionEnv = {
    name: string;
    [key: string]: unknown;
};
export declare function loadEnv<TEnv extends RegressionEnv = RegressionEnv>(envName?: string): TEnv;
export { resolveFromProjectRoot };
