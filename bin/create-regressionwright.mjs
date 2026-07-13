#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const harnessPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = path.join(harnessPackageRoot, 'templates', 'project');
const skillSourceRoot = path.join(harnessPackageRoot, 'skills', 'regressionwright');

const projectSkillIntegrations = {
  codex: path.join('.agents', 'skills', 'regressionwright'),
  claude: path.join('.claude', 'skills', 'regressionwright'),
};
const optionalReporters = {
  stagewright: {
    packageName: 'playwright-smart-reporter',
    packageVersion: '1.6.5',
  },
};

try {
  const options = parseArgs(process.argv.slice(2));
  await scaffoldProject(options);
  printNextSteps(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    targetDir: undefined,
    moduleId: undefined,
    packageName: undefined,
    corePackage: '^0.1.0',
    integrations: [],
    reporter: undefined,
    force: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--module') {
      options.moduleId = requireValue(args, index, '--module');
      index += 1;
      continue;
    }
    if (arg === '--package-name') {
      options.packageName = requireValue(args, index, '--package-name');
      index += 1;
      continue;
    }
    if (arg === '--core-package') {
      options.corePackage = requireValue(args, index, '--core-package');
      index += 1;
      continue;
    }
    if (arg === '--integration') {
      options.integrations.push(...parseIntegrationList(requireValue(args, index, '--integration')));
      index += 1;
      continue;
    }
    if (arg.startsWith('--integration=')) {
      options.integrations.push(...parseIntegrationList(arg.slice('--integration='.length)));
      continue;
    }
    if (arg === '--reporter') {
      options.reporter = requireValue(args, index, '--reporter');
      index += 1;
      continue;
    }
    if (arg.startsWith('--reporter=')) {
      options.reporter = arg.slice('--reporter='.length);
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.targetDir) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    options.targetDir = arg;
  }

  if (!options.targetDir) {
    throw new Error('Usage: create-regressionwright <project-dir> [--module <module-id>] [--package-name <name>] [--core-package <specifier>] [--reporter stagewright] [--force]');
  }

  const targetPath = path.resolve(process.cwd(), options.targetDir);
  const targetName = path.basename(targetPath);
  const defaultModule = normalizeModuleId(stripRegressionSuffix(targetName));
  return {
    ...options,
    targetPath,
    moduleId: normalizeModuleId(options.moduleId || defaultModule),
    packageName: options.packageName || normalizePackageName(targetName),
    integrations: normalizeIntegrations(options.integrations),
    reporter: normalizeReporter(options.reporter),
  };
}

function requireValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

async function scaffoldProject(options) {
  const reporterTemplate = createReporterTemplate(options.reporter, options.moduleId);
  await assertTarget(options.targetPath, options.force);
  const tokens = {
    __PROJECT_NAME__: path.basename(options.targetPath),
    __PACKAGE_NAME__: options.packageName,
    __MODULE_ID__: options.moduleId,
    __CORE_PACKAGE_SPECIFIER__: options.corePackage,
    __OPTIONAL_REPORTER_IMPORTS__: reporterTemplate.imports,
    __OPTIONAL_REPORTER_SETUP__: reporterTemplate.setup,
    __OPTIONAL_REPORTER_ENTRIES__: reporterTemplate.entries,
    __OPTIONAL_REPORTER_README__: reporterTemplate.readme,
  };
  await copyTemplate(templateRoot, options.targetPath, tokens);
  await configureProjectPackage(options);
  await installProjectSkills(options);
}

async function configureProjectPackage(options) {
  if (!options.reporter) {
    return;
  }

  const reporter = optionalReporters[options.reporter];
  const packagePath = path.join(options.targetPath, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  packageJson.devDependencies[reporter.packageName] = reporter.packageVersion;
  await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

async function installProjectSkills(options) {
  for (const integration of options.integrations) {
    const targetRelativeDir = projectSkillIntegrations[integration];
    const targetDir = path.join(options.targetPath, targetRelativeDir);
    await fs.rm(targetDir, { recursive: true, force: true });
    await copyTemplate(skillSourceRoot, targetDir, {});
  }
}

async function assertTarget(targetPath, force) {
  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isDirectory()) {
      throw new Error(`Target exists and is not a directory: ${targetPath}`);
    }
    const entries = await fs.readdir(targetPath);
    if (entries.length > 0 && !force) {
      throw new Error(`Target directory is not empty: ${targetPath}. Use --force to write into it.`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function copyTemplate(sourceDir, targetDir, tokens) {
  await fs.mkdir(targetDir, { recursive: true });
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === '.DS_Store') {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, replaceTokens(entry.name, tokens));

    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, targetPath, tokens);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const content = await fs.readFile(sourcePath, 'utf8');
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, replaceTokens(content, tokens), 'utf8');
  }
}

function replaceTokens(value, tokens) {
  return Object.entries(tokens).reduce(
    (result, [token, replacement]) => result.split(token).join(replacement),
    value
  );
}

function stripRegressionSuffix(value) {
  return value
    .replace(/-regression-test$/i, '')
    .replace(/-regression$/i, '')
    .replace(/-test$/i, '');
}

function normalizeModuleId(value) {
  const moduleId = String(value || 'app')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!moduleId) {
    return 'app';
  }
  return /^[a-z]/.test(moduleId) ? moduleId : `app-${moduleId}`;
}

function normalizePackageName(value) {
  return String(value || 'regression-test')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@/_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'regression-test';
}

function parseIntegrationList(value) {
  return String(value)
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeIntegrations(values) {
  const requested = values.length > 0 ? values : [];
  const expanded = requested.flatMap(value => value === 'all' ? Object.keys(projectSkillIntegrations) : [value]);
  const unknown = expanded.filter(value => !projectSkillIntegrations[value]);
  if (unknown.length > 0) {
    throw new Error(`Unknown integration "${unknown[0]}". Supported integrations: ${Object.keys(projectSkillIntegrations).join(', ')}, all.`);
  }
  return [...new Set(expanded)];
}

function normalizeReporter(value) {
  if (!value) {
    return undefined;
  }

  const reporter = String(value).trim().toLowerCase();
  if (!optionalReporters[reporter]) {
    throw new Error(`Unknown reporter "${value}". Supported optional reporters: ${Object.keys(optionalReporters).join(', ')}.`);
  }
  return reporter;
}

function createReporterTemplate(reporter, moduleId) {
  if (reporter !== 'stagewright') {
    return { imports: '', setup: '', entries: '', readme: '' };
  }

  return {
    imports: `import fs from 'node:fs';\nimport path from 'node:path';`,
    setup: `const stageWrightProject = [
  process.env.E2E_REGRESSION_MODULE || '${moduleId}',
  process.env.E2E_REGRESSION_ENV || 'dev',
  process.env.E2E_REGRESSION_PIPELINE || 'playwright-raw',
]
  .map(value => value.replace(/[^A-Za-z0-9._-]/g, '-'))
  .join('-');
const stageWrightHistoryFile = path.resolve(
  'artifacts',
  'stagewright-history',
  '{project}.json'
);
fs.mkdirSync(path.dirname(stageWrightHistoryFile), { recursive: true });`,
    entries: `    ['playwright-smart-reporter', {
      outputFile: path.join(reportDir, 'stagewright-report.html'),
      historyFile: stageWrightHistoryFile,
      projectName: stageWrightProject,
      runId: process.env.E2E_REGRESSION_RUN_ID,
      maxHistoryRuns: 30,
      filterPwApiSteps: true,
      enableNetworkLogs: true,
      networkLogExcludeAssets: true,
      enableAIRecommendations: false,
      enableAISuiteHealth: false,
      uploadToCloud: false,
      uploadArtifacts: false,
    }],`,
    readme: `## Optional StageWright Report\n\nThis project was generated with the optional StageWright reporter. Each run writes:\n\n\`\`\`text\nartifacts/runs/{pipeline}/{runId}/playwright-report/stagewright-report.html\nartifacts/stagewright-history/\n\`\`\`\n\nStageWright cloud upload and managed AI features are disabled. The harness stage checks and \`summary.json\` remain the source of truth for pass/fail.`,
  };
}

function printHelp() {
  console.log(`Usage: create-regressionwright <project-dir> [options]

Options:
  --module <module-id>        Module id for the starter project pack.
  --package-name <name>       package.json name. Defaults to the directory name.
  --core-package <spec>       @regressionwright/core dependency specifier. Defaults to ^0.1.0.
  --integration <name>        Install project-level AI skill: codex, claude, or all.
  --reporter <name>           Install an optional project reporter: stagewright.
  --force                     Write into a non-empty target directory.
  -h, --help                  Show this help.
`);
}

function printNextSteps(options) {
  const relativeTarget = path.relative(process.cwd(), options.targetPath) || '.';
  console.log(`Created ${relativeTarget}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  cd ${relativeTarget}`);
  console.log('  pnpm install');
  console.log('  pnpm exec playwright install chromium');
  if (options.integrations.length === 0) {
    console.log('  pnpm regressionwright --integration codex');
  }
  console.log('  pnpm regressionwright registry');
  console.log('  pnpm regressionwright run --headed');
  if (options.reporter === 'stagewright') {
    console.log('  # StageWright: artifacts/runs/{pipeline}/{runId}/playwright-report/stagewright-report.html');
  }
}
