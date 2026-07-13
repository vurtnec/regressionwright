import fs from 'node:fs/promises';
import path from 'node:path';
import { readHarnessEnvNumber } from './env-vars.mjs';

const DEFAULT_SLOW_REQUEST_MS = 3_000;
const API_RESOURCE_TYPES = new Set(['fetch', 'xhr']);

export async function createPerformanceMonitor(params) {
  const monitor = new PerformanceMonitor(params);
  await monitor.install();
  return monitor;
}

class PerformanceMonitor {
  constructor(params) {
    this.page = params.page;
    this.run = params.run;
    this.testInfo = params.testInfo;
    this.slowRequestMs = params.slowRequestMs ?? readHarnessEnvNumber('PERFORMANCE_SLOW_REQUEST_MS', DEFAULT_SLOW_REQUEST_MS);
    this.apiUrlPatterns = params.apiUrlPatterns || [];
    this.entries = [];
    this.requests = [];
    this.requestRecords = new Map();
    this.consoleMessages = [];
    this.pageErrors = [];
    this.requestIndex = 0;
    this.installed = false;
    this.reportAttached = false;
  }

  async install() {
    if (this.installed) {
      return;
    }
    this.installed = true;
    this.installRequestListeners();
    this.installConsoleListeners();
    await this.installLongTaskObserver();
  }

  async measureInitialRender(stage, name, operation) {
    return this.measure('initial-render', stage, name, operation);
  }

  async measureRouteChange(stage, name, operation) {
    return this.measure('action', stage, name, operation);
  }

  async measureAction(stage, name, operation) {
    return this.measure('action', stage, name, operation);
  }

  async measure(kind, stage, name, operation) {
    const startMs = Date.now();
    const before = await this.safePageSnapshot();
    let status = 'passed';
    let error;

    try {
      return await operation();
    } catch (caught) {
      status = 'failed';
      error = normalizeError(caught);
      throw caught;
    } finally {
      const endMs = Date.now();
      const after = await this.safePageSnapshot();
      const apiRequests = this.requestsForWindow(startMs, endMs).filter(request => this.isBackendApiRequest(request));
      const failedRequests = apiRequests.filter(request => request.failed || request.status >= 400);
      const slowRequests = apiRequests
        .filter(request => Number(request.durationMs || 0) >= this.slowRequestMs)
        .sort((left, right) => Number(right.durationMs || 0) - Number(left.durationMs || 0));
      const consoleErrors = this.consoleMessages.filter(message => message.timestampMs >= startMs && message.timestampMs <= endMs);
      const pageErrors = this.pageErrors.filter(pageError => pageError.timestampMs >= startMs && pageError.timestampMs <= endMs);
      const longTasks = (after.longTasks || []).filter(task => task.startEpochMs >= startMs && task.startEpochMs <= endMs);

      this.entries.push({
        kind,
        name,
        stageId: stage?.refId || stage?.id,
        stageName: stage?.name,
        startedAt: new Date(startMs).toISOString(),
        endedAt: new Date(endMs).toISOString(),
        durationMs: endMs - startMs,
        status,
        urlBefore: before.url,
        urlAfter: after.url,
        titleBefore: before.title,
        titleAfter: after.title,
        navigation: after.navigation,
        paint: after.paint,
        requests: {
          total: apiRequests.length,
          failed: failedRequests.length,
          slow: slowRequests.length,
          apiStats: summarizeApiRequests(apiRequests.map(toRequestSummary)),
          apiRequests: apiRequests.map(toRequestSummary),
          failedRequests: failedRequests.map(toRequestSummary),
          slowRequests: slowRequests.slice(0, 10).map(toRequestSummary),
        },
        console: {
          errors: consoleErrors,
          pageErrors,
        },
        longTasks: {
          total: longTasks.length,
          tasks: longTasks.slice(0, 10),
        },
        error,
      });
    }
  }

  async writeReport(options = {}) {
    const apiRequests = this.entries.flatMap(entry => entry.requests.apiRequests || []);
    const report = {
      schemaVersion: 1,
      runId: this.run.runId,
      pipelineId: this.run.pipelineId,
      envName: this.run.envName,
      generatedAt: new Date().toISOString(),
      slowRequestThresholdMs: this.slowRequestMs,
      apiFilter: {
        resourceTypes: [...API_RESOURCE_TYPES],
        urlPatterns: this.apiUrlPatterns.map(pattern => String(pattern)),
      },
      totals: summarizeTotals(this.entries),
      apiSummary: summarizeApiRequests(apiRequests),
      entries: this.entries,
    };
    const runDir = this.run.artifacts.runDir;
    const jsonPath = path.join(runDir, 'performance.json');
    const summaryPath = path.join(runDir, 'performance-summary.md');

    await fs.mkdir(runDir, { recursive: true });
    await Promise.all([
      fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
      fs.writeFile(summaryPath, formatSummary(report), 'utf8'),
    ]);

    if (options.attach !== false && this.testInfo && !this.reportAttached) {
      this.reportAttached = true;
      await this.testInfo.attach('performance', {
        path: jsonPath,
        contentType: 'application/json',
      });
      await this.testInfo.attach('performance-summary', {
        path: summaryPath,
        contentType: 'text/markdown',
      });
    }

    return { jsonPath, summaryPath, report };
  }

  installRequestListeners() {
    this.page.on('request', request => {
      const record = {
        id: String(++this.requestIndex),
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        startMs: Date.now(),
      };
      this.requestRecords.set(request, record);
      this.requests.push(record);
    });

    this.page.on('response', response => {
      const record = this.requestRecords.get(response.request());
      if (!record) {
        return;
      }
      record.status = response.status();
      record.statusText = response.statusText();
    });

    this.page.on('requestfinished', request => {
      this.finishRequest(request);
    });

    this.page.on('requestfailed', request => {
      const record = this.requestRecords.get(request);
      if (record) {
        record.failed = true;
        record.failureText = request.failure()?.errorText;
      }
      this.finishRequest(request);
    });
  }

  installConsoleListeners() {
    this.page.on('console', message => {
      if (!['error', 'warning'].includes(message.type())) {
        return;
      }
      this.consoleMessages.push({
        timestampMs: Date.now(),
        type: message.type(),
        text: message.text(),
        location: message.location(),
      });
    });

    this.page.on('pageerror', error => {
      this.pageErrors.push({
        timestampMs: Date.now(),
        message: error.message,
        stack: error.stack,
      });
    });
  }

  async installLongTaskObserver() {
    await this.page.addInitScript(() => {
      if (globalThis.__e2eRegressionLongTaskObserverInstalled) {
        return;
      }
      globalThis.__e2eRegressionLongTaskObserverInstalled = true;
      globalThis.__e2eRegressionLongTasks = [];
      if (!globalThis.PerformanceObserver) {
        return;
      }
      try {
        const observer = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            globalThis.__e2eRegressionLongTasks.push({
              name: entry.name,
              startTime: Math.round(entry.startTime),
              durationMs: Math.round(entry.duration),
              startEpochMs: Math.round(performance.timeOrigin + entry.startTime),
            });
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        // Long Task API is not available in every browser/runtime.
      }
    });
  }

  finishRequest(request) {
    const record = this.requestRecords.get(request);
    if (!record) {
      return;
    }
    record.endMs = Date.now();
    record.wallClockDurationMs = record.endMs - record.startMs;
    record.timing = safeSync(() => request.timing());
    record.timingPhases = deriveTimingPhases(record.timing, record.wallClockDurationMs);
    record.durationMs = record.timingPhases.totalMs ?? record.wallClockDurationMs;
  }

  requestsForWindow(startMs, endMs) {
    return this.requests.filter(request => {
      const requestEndMs = request.endMs || endMs;
      return request.startMs <= endMs && requestEndMs >= startMs;
    });
  }

  isBackendApiRequest(request) {
    if (!API_RESOURCE_TYPES.has(request.resourceType)) {
      return false;
    }

    if (this.apiUrlPatterns.length === 0) {
      return true;
    }

    return this.apiUrlPatterns.some(pattern => matchesUrlPattern(pattern, request.url));
  }

  async safePageSnapshot() {
    const snapshot = {
      url: safeSync(() => this.page.url()),
      title: undefined,
      navigation: undefined,
      paint: undefined,
      longTasks: [],
    };

    try {
      snapshot.title = await this.page.title();
    } catch {
      snapshot.title = undefined;
    }

    try {
      const metrics = await this.page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const paintEntries = Object.fromEntries(
          performance.getEntriesByType('paint').map(entry => [entry.name, Math.round(entry.startTime)])
        );
        return {
          navigation: navigation
            ? {
                type: navigation.type,
                domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd),
                loadMs: Math.round(navigation.loadEventEnd),
                responseStartMs: Math.round(navigation.responseStart),
                responseEndMs: Math.round(navigation.responseEnd),
              }
            : undefined,
          paint: {
            firstPaintMs: paintEntries['first-paint'],
            firstContentfulPaintMs: paintEntries['first-contentful-paint'],
          },
          longTasks: globalThis.__e2eRegressionLongTasks || [],
        };
      });
      snapshot.navigation = metrics.navigation;
      snapshot.paint = metrics.paint;
      snapshot.longTasks = metrics.longTasks || [];
    } catch {
      // Page can be navigating or closed while a failed stage is unwinding.
    }

    return snapshot;
  }
}

function toRequestSummary(request) {
  const api = parseApiIdentity(request);

  return {
    apiKey: api.key,
    apiName: api.name,
    host: api.host,
    path: api.path,
    method: request.method,
    url: request.url,
    resourceType: request.resourceType,
    status: request.status,
    failed: Boolean(request.failed),
    failureText: request.failureText,
    durationMs: request.durationMs,
    wallClockDurationMs: request.wallClockDurationMs,
    queueMs: request.timingPhases?.queueMs,
    stallMs: request.timingPhases?.stallMs,
    serverResponseMs: request.timingPhases?.serverResponseMs,
    downloadMs: request.timingPhases?.downloadMs,
    timing: request.timing,
  };
}

function summarizeTotals(entries) {
  return {
    entries: entries.length,
    byKind: entries.reduce((totals, entry) => {
      totals[entry.kind] = (totals[entry.kind] || 0) + 1;
      return totals;
    }, {}),
    failedEntries: entries.filter(entry => entry.status === 'failed').length,
    totalRequests: entries.reduce((total, entry) => total + entry.requests.total, 0),
    totalApiRequests: entries.reduce((total, entry) => total + entry.requests.total, 0),
    slowRequests: entries.reduce((total, entry) => total + entry.requests.slow, 0),
    failedRequests: entries.reduce((total, entry) => total + entry.requests.failed, 0),
    failedApiRequests: entries.reduce((total, entry) => total + entry.requests.failed, 0),
    consoleErrors: entries.reduce(
      (total, entry) => total + entry.console.errors.length + entry.console.pageErrors.length,
      0
    ),
    longTasks: entries.reduce((total, entry) => total + entry.longTasks.total, 0),
  };
}

function formatSummary(report) {
  const lines = [
    '# Performance Summary',
    '',
    `Run: ${report.pipelineId} / ${report.runId}`,
    `Environment: ${report.envName}`,
    `API filter: ${report.apiFilter.resourceTypes.join(', ')}${report.apiFilter.urlPatterns.length > 0 ? ` matching ${report.apiFilter.urlPatterns.join(', ')}` : ''}`,
    '',
    '| Kind | Stage | Name | Duration | APIs | API Failed | Console | Long Tasks | URL |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const entry of report.entries) {
    lines.push(
      [
        entry.kind,
        entry.stageId || '',
        escapeMarkdown(entry.name),
        `${entry.durationMs}ms`,
        String(entry.requests.total),
        String(entry.requests.failed),
        String(entry.console.errors.length + entry.console.pageErrors.length),
        String(entry.longTasks.total),
        escapeMarkdown(entry.urlAfter || ''),
      ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')
    );
  }

  if (report.apiSummary.length > 0) {
    lines.push(
      '',
      '## Backend API P90/P95',
      '',
      '| API | Count | Avg | P90 | P95 | Max | Queue P95 | Stall P95 | Server P95 | Failed |',
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
    );

    for (const api of report.apiSummary.slice(0, 40)) {
      lines.push(
        [
          escapeMarkdown(api.apiName),
          String(api.count),
          formatMs(api.avgMs),
          formatMs(api.p90Ms),
          formatMs(api.p95Ms),
          formatMs(api.maxMs),
          formatMs(api.queueP95Ms),
          formatMs(api.stallP95Ms),
          formatMs(api.serverResponseP95Ms),
          String(api.failed),
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')
      );
    }
  }

  const slowestApiCalls = report.entries.flatMap(entry =>
    entry.requests.apiRequests.map(request => ({
      entry,
      request,
    }))
  ).sort((left, right) => Number(right.request.durationMs || 0) - Number(left.request.durationMs || 0));

  if (slowestApiCalls.length > 0) {
    lines.push('', '## Slowest Backend API Calls', '');
    for (const { entry, request } of slowestApiCalls.slice(0, 20)) {
      lines.push(
        `- ${entry.kind} ${entry.stageId || ''}: ${formatMs(request.durationMs)} ${request.apiName} ` +
          `(queue ${formatMs(request.queueMs)}, stall ${formatMs(request.stallMs)}, server ${formatMs(request.serverResponseMs)})`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function summarizeApiRequests(requests) {
  const groups = new Map();

  for (const request of requests) {
    const api = {
      key: request.apiKey,
      name: request.apiName,
      host: request.host,
      path: request.path,
      method: request.method,
    };
    const group = groups.get(api.key) || {
      ...api,
      requests: [],
    };
    group.requests.push(request);
    groups.set(api.key, group);
  }

  return [...groups.values()]
    .map(group => summarizeApiGroup(group))
    .sort((left, right) => Number(right.p95Ms || 0) - Number(left.p95Ms || 0));
}

function summarizeApiGroup(group) {
  const durations = group.requests.map(request => request.durationMs).filter(isNumber);
  const queues = group.requests.map(request => request.queueMs).filter(isNumber);
  const stalls = group.requests.map(request => request.stallMs).filter(isNumber);
  const serverResponses = group.requests.map(request => request.serverResponseMs).filter(isNumber);
  const downloads = group.requests.map(request => request.downloadMs).filter(isNumber);

  return {
    apiKey: group.key,
    apiName: group.name,
    host: group.host,
    path: group.path,
    method: group.method,
    count: group.requests.length,
    failed: group.requests.filter(request => request.failed || request.status >= 400).length,
    avgMs: average(durations),
    p90Ms: percentile(durations, 90),
    p95Ms: percentile(durations, 95),
    maxMs: durations.length > 0 ? Math.max(...durations) : undefined,
    queueP95Ms: percentile(queues, 95),
    stallP95Ms: percentile(stalls, 95),
    serverResponseP95Ms: percentile(serverResponses, 95),
    downloadP95Ms: percentile(downloads, 95),
  };
}

function parseApiIdentity(request) {
  try {
    const url = new URL(request.url);
    return {
      key: `${request.method} ${url.origin}${url.pathname}`,
      name: `${request.method} ${url.pathname}`,
      host: url.host,
      path: url.pathname,
    };
  } catch {
    return {
      key: `${request.method} ${request.url}`,
      name: `${request.method} ${request.url}`,
      host: undefined,
      path: request.url,
    };
  }
}

function deriveTimingPhases(timing, fallbackDurationMs) {
  if (!timing) {
    return {
      totalMs: fallbackDurationMs,
    };
  }

  const firstNetworkStart = minDefined([
    validTiming(timing.domainLookupStart),
    validTiming(timing.connectStart),
    validTiming(timing.requestStart),
  ]);
  const requestStart = validTiming(timing.requestStart);
  const responseStart = validTiming(timing.responseStart);
  const responseEnd = validTiming(timing.responseEnd);

  return {
    totalMs: responseEnd ?? fallbackDurationMs,
    queueMs: firstNetworkStart,
    stallMs: requestStart === undefined ? undefined : Math.max(0, requestStart - (firstNetworkStart ?? 0)),
    serverResponseMs:
      requestStart === undefined || responseStart === undefined ? undefined : Math.max(0, responseStart - requestStart),
    downloadMs:
      responseStart === undefined || responseEnd === undefined ? undefined : Math.max(0, responseEnd - responseStart),
  };
}

function matchesUrlPattern(pattern, url) {
  if (pattern instanceof RegExp) {
    return pattern.test(url);
  }

  return String(url).includes(String(pattern));
}

function validTiming(value) {
  return typeof value === 'number' && value >= 0 ? Math.round(value) : undefined;
}

function minDefined(values) {
  const defined = values.filter(isNumber);
  return defined.length > 0 ? Math.min(...defined) : undefined;
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
}

function average(values) {
  if (values.length === 0) {
    return undefined;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatMs(value) {
  return isNumber(value) ? `${Math.round(value)}ms` : '-';
}

function normalizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: error instanceof Error ? error.name : undefined,
    message: message.length > 500 ? `${message.slice(0, 497)}...` : message,
  };
}

function escapeMarkdown(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function safeSync(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
