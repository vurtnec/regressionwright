import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHarnessEnv } from './env-vars.mjs';

export const harnessPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const explicitProjectRoot =
  readHarnessEnv('PROJECT_ROOT') ||
  process.env.HARNESS_PROJECT_ROOT;

export const consumerProjectRoot = path.resolve(
  explicitProjectRoot || findConsumerProjectRoot(process.cwd())
);

export function resolveFromProjectRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(consumerProjectRoot, value);
}

export function resolveFromHarnessPackageRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(harnessPackageRoot, value);
}

export function projectPath(...segments) {
  return path.join(consumerProjectRoot, ...segments);
}

export function harnessPackagePath(...segments) {
  return path.join(harnessPackageRoot, ...segments);
}

function findConsumerProjectRoot(startDirectory) {
  let directory = path.resolve(startDirectory);

  while (true) {
    if (fs.existsSync(path.join(directory, 'config', 'harness.json'))) {
      return directory;
    }

    const parentDirectory = path.dirname(directory);
    if (parentDirectory === directory) {
      return path.resolve(startDirectory);
    }
    directory = parentDirectory;
  }
}
