const fs = require('fs');
const path = require('path');

const RUNS_DIR = path.resolve(__dirname, '..', 'tests', '.runs');

function readLatestRun() {
  const p = path.join(RUNS_DIR, 'LATEST.md');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function parseRunMarkdown(md) {
  if (!md) return null;
  const result = { timestamp: null, total: 0, passed: 0, failed: 0, skipped: 0, duration: 0, status: 'unknown', tests: [], bugs: [] };

  const tsMatch = md.match(/^# Run (.+)$/m);
  if (tsMatch) result.timestamp = tsMatch[1].trim();

  const sumMatch = md.match(/Total: (\d+) \| Passed: (\d+) \| Failed: (\d+) \| Skipped: (\d+)/);
  if (sumMatch) {
    result.total = parseInt(sumMatch[1], 10);
    result.passed = parseInt(sumMatch[2], 10);
    result.failed = parseInt(sumMatch[3], 10);
    result.skipped = parseInt(sumMatch[4], 10);
  }

  const durMatch = md.match(/Duracion: ([0-9.]+)s/);
  if (durMatch) result.duration = parseFloat(durMatch[1]);

  const statusMatch = md.match(/Status final: (\w+)/);
  if (statusMatch) result.status = statusMatch[1];

  const testLineRegex = /^- (.+?) \(([0-9.]+s|skip)\)$/gm;
  let m;
  while ((m = testLineRegex.exec(md)) !== null) {
    const title = m[1].replace(/^.\s*/, '').trim();
    const dur = m[2];
    let status = 'unknown';
    if (title.startsWith('\u2705')) status = 'passed';
    else if (title.startsWith('\u23ED')) status = 'skipped';
    else if (title.startsWith('\u274C')) status = 'failed';
    else if (title.startsWith('\u23F1')) status = 'timedOut';

    const cleanTitle = title.replace(/^.\s*/, '').trim();
    result.tests.push({ title: cleanTitle, status, duration: dur });
  }

  const bugRegex = /\*\*([A-Z]+-\d+)\*\* \[(\w+)\] _([^_]+)_/g;
  while ((m = bugRegex.exec(md)) !== null) {
    result.bugs.push({ id: m[1], status: m[2], area: m[3].trim() });
  }

  return result;
}

function listHistoricalRuns(limit = 5) {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const files = fs.readdirSync(RUNS_DIR)
    .filter(f => f.startsWith('run-') && f.endsWith('.md'))
    .sort()
    .slice(-limit);
  return files.map(f => ({
    file: f,
    path: path.join(RUNS_DIR, f),
    parsed: parseRunMarkdown(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8')),
  }));
}

function compareRuns(current, previous) {
  if (!previous) {
    return { improved: [], regressed: [], unchanged: current.tests.length, hasPrevious: false };
  }

  const prevByName = new Map(previous.tests.map(t => [t.title, t.status]));
  const improved = [];
  const regressed = [];
  let unchanged = 0;

  for (const t of current.tests) {
    const prev = prevByName.get(t.title);
    if (!prev) continue;
    if (prev !== t.status) {
      if (t.status === 'passed' && (prev === 'failed' || prev === 'skipped')) {
        improved.push({ title: t.title, from: prev, to: t.status });
      } else if (t.status === 'failed' || t.status === 'skipped') {
        if (prev === 'passed') {
          regressed.push({ title: t.title, from: prev, to: t.status });
        }
      }
    } else {
      unchanged++;
    }
  }

  return { improved, regressed, unchanged, hasPrevious: true };
}

function summarize(current, previous) {
  const cmp = compareRuns(current, previous);
  return {
    current: {
      timestamp: current.timestamp,
      total: current.total,
      passed: current.passed,
      failed: current.failed,
      skipped: current.skipped,
      duration: current.duration,
      status: current.status,
    },
    previousTimestamp: previous ? previous.timestamp : null,
    delta: {
      improved: cmp.improved.length,
      regressed: cmp.regressed.length,
      unchanged: cmp.unchanged,
    },
    improvedTests: cmp.improved,
    regressedTests: cmp.regressed,
    bugsKnown: current.bugs.length,
    bugsOpen: current.bugs.filter(b => b.status === 'open').length,
    hasPrevious: cmp.hasPrevious,
  };
}

module.exports = { parseRunMarkdown, listHistoricalRuns, compareRuns, summarize, readLatestRun };