import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error('Package audit must be run through pnpm.');
}

const result = spawnSync(process.execPath, [pnpmCli, 'pack', '--dry-run', '--json'], {
  cwd: packageRoot,
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

const manifest = JSON.parse(result.stdout);
const packedFiles = new Set(manifest.files.map(entry => entry.path));
const requiredFiles = [
  'LICENSE',
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'bin/regressionwright.mjs',
  'bin/create-regressionwright.mjs',
  'scripts/appium-runner.mjs',
];
const forbiddenPatterns = [
  /(^|\/)node_modules\//,
  /(^|\/)(artifacts|test-results|playwright-report)\//,
  /(^|\/)\.DS_Store$/,
  /\.drawio\.bkp$/,
  /(^|\/)\.env(?:\.|$)/,
];

const errors = [];
for (const requiredFile of requiredFiles) {
  if (!packedFiles.has(requiredFile)) {
    errors.push(`required package file is missing: ${requiredFile}`);
  }
}

for (const packedFile of packedFiles) {
  if (
    packedFile === 'templates/project/.env.example' ||
    packedFile === 'templates/appium-project/.env.example'
  ) {
    continue;
  }
  if (forbiddenPatterns.some(pattern => pattern.test(packedFile))) {
    errors.push(`private or generated file would be published: ${packedFile}`);
  }
}

for (const target of exportTargets(packageJson.exports)) {
  const packedTarget = target.replace(/^\.\//, '');
  if (!packedFiles.has(packedTarget)) {
    errors.push(`export target is not included in the package: ${target}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`PACKAGE_AUDIT_ERROR: ${error}`);
  }
  process.exit(1);
}

console.log(`Package audit passed: ${packedFiles.size} files in ${manifest.filename}.`);

function exportTargets(exportsField) {
  const targets = [];
  collectExportTargets(exportsField, targets);
  return targets;
}

function collectExportTargets(value, targets) {
  if (typeof value === 'string') {
    targets.push(value);
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const nestedValue of Object.values(value)) {
    collectExportTargets(nestedValue, targets);
  }
}
