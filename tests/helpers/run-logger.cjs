const { parsePlaywrightOutput, renderMarkdown } = require('./logger-core.cjs');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RUNS_DIR = path.resolve(__dirname, '..', '.runs');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function pad(n) { return String(n).padStart(2, '0'); }

function timestamp() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function readableTimestamp() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function main() {
  ensureDir(RUNS_DIR);

  console.log('[run-logger] ejecutando suite y capturando output...');
  let stdout, stderr;
  try {
    stdout = execSync('npx playwright test --config=tests/playwright.config.cjs --reporter=list', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });
    stderr = '';
  } catch (err) {
    stdout = err.stdout ? err.stdout.toString() : '';
    stderr = err.stderr ? err.stderr.toString() : '';
  }

  const parsed = parsePlaywrightOutput(stdout);
  const md = renderMarkdown(parsed);

  const filename = 'run-' + timestamp() + '.md';
  const fullPath = path.join(RUNS_DIR, filename);
  fs.writeFileSync(fullPath, md, 'utf8');
  console.log('[run-logger] escrito: ' + path.relative(PROJECT_ROOT, fullPath));

  const indexPath = path.join(RUNS_DIR, 'LATEST.md');
  const indexContent = '# LATEST - ultima corrida\n\n_Este archivo se sobreescribe en cada corrida. Para historial completo ver archivos run-*.md._\n\nRun timestamp: ' + readableTimestamp() + '\n\n' + md;
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  console.log('[run-logger] escrito: ' + path.relative(PROJECT_ROOT, indexPath));

  process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  if (parsed.summary.failed > 0) process.exit(1);
}

main();