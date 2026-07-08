const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { readLatestRun, parseRunMarkdown, listHistoricalRuns, summarize } = require('./historian.cjs');

function knownBugs() {
  return [
    {
      id: 'BUG-001',
      area: 'flows / nueva carpeta',
      summary: 'window.prompt() no funciona en Electron con contextIsolation=true',
      evidence: 'Renderer log: prompt() is not supported. Playwright no puede automatizar el flujo.',
      impact: 'Boton Nueva carpeta no permite al usuario ingresar nombre en produccion.',
      proposed_fix: 'Migrar a input en el DOM (modal propio) o usar dialog.showMessageBox desde el main process.',
      status: 'fixed',
      fix_applied: 'Task 4.3 reemplazo prompt() por <dialog> HTML con input nativo. Suite ahora 15/15 sin skips.',
    },
  ];
}

const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(PROJECT_ROOT, 'tests', '.runs');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) { console.log('[agent] ' + msg); }
function warn(msg) { console.warn('[agent] ' + msg); }
function err(msg) { console.error('[agent] ' + msg); }

function killZombieElectrons() {
  try {
    if (process.platform === 'win32') {
      execSync('powershell -NoProfile -Command "Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
    } else {
      execSync('pkill -f electron || true', { stdio: 'ignore' });
    }
    log('procesos electron zombie eliminados');
  } catch (e) {
    warn('no se pudieron limpiar zombies: ' + e.message);
  }
}

function runSuite() {
  log('corriendo suite (npm run test:log)...');
  const start = Date.now();
  let stdout, stderr;
  try {
    stdout = execSync('npm run test:log', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    });
    stderr = '';
  } catch (e) {
    stdout = e.stdout ? e.stdout.toString() : '';
    stderr = e.stderr ? e.stderr.toString() : '';
  }
  const dur = ((Date.now() - start) / 1000).toFixed(1);
  return { stdout, stderr, dur };
}

function getPreviousRun() {
  const files = fs.readdirSync(RUNS_DIR)
    .filter(f => f.startsWith('run-') && f.endsWith('.md'))
    .sort();
  if (files.length < 2) return null;
  const prevFile = path.join(RUNS_DIR, files[files.length - 2]);
  return parseRunMarkdown(fs.readFileSync(prevFile, 'utf8'));
}

function printReport(summary) {
  const c = summary.current;
  log('corrida: ' + c.timestamp);
  log('totales: ' + c.passed + '/' + c.total + ' pass, ' + c.failed + ' fail, ' + c.skipped + ' skip (' + c.duration + 's)');

  if (summary.hasPrevious) {
    log('delta vs ' + summary.previousTimestamp + ':');
    log('  mejoraron: ' + summary.delta.improved);
    log('  regresiones: ' + summary.delta.regressed);
    log('  sin cambios: ' + summary.delta.unchanged);
    for (const r of summary.regressedTests) {
      log('  REGRESION: ' + r.title + ' (' + r.from + ' -> ' + r.to + ')');
    }
    for (const i of summary.improvedTests) {
      log('  MEJORA: ' + i.title + ' (' + i.from + ' -> ' + i.to + ')');
    }
  } else {
    log('sin corrida previa para comparar (primera ejecucion)');
  }

  log('bugs conocidos: ' + summary.bugsKnown + ' (' + summary.bugsOpen + ' abiertos)');
}

async function saveToMemory(summary, runFile) {
  const memDir = path.join(PROJECT_ROOT, 'agents', '.memory');
  if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });

  const entry = {
    timestamp: summary.current.timestamp,
    totals: {
      passed: summary.current.passed,
      failed: summary.current.failed,
      skipped: summary.current.skipped,
      total: summary.current.total,
      duration: summary.current.duration,
    },
    delta: summary.delta,
    bugsKnown: summary.bugsKnown,
    bugsOpen: summary.bugsOpen,
    runFile: path.relative(PROJECT_ROOT, runFile),
  };

  const memFile = path.join(memDir, 'last-run.json');
  fs.writeFileSync(memFile, JSON.stringify(entry, null, 2), 'utf8');

  const histFile = path.join(memDir, 'history.jsonl');
  const line = JSON.stringify(entry) + '\n';
  fs.appendFileSync(histFile, line, 'utf8');

  const memMdFile = path.join(memDir, 'memory.md');
  const content = [
    '# Memoria del agente test-runner',
    '',
    'Ultima corrida: **' + entry.timestamp + '**',
    '',
    '## Totales',
    '- Pass: ' + entry.totals.passed + ' / ' + entry.totals.total,
    '- Fail: ' + entry.totals.failed,
    '- Skip: ' + entry.totals.skipped,
    '- Duracion: ' + entry.totals.duration + 's',
    '',
    '## Delta vs corrida anterior',
    '- Mejoraron: ' + entry.delta.improved,
    '- Regresiones: ' + entry.delta.regressed,
    '- Sin cambios: ' + entry.delta.unchanged,
    '',
    '## Bugs',
    '- Conocidos: ' + entry.bugsKnown + ' (abiertos: ' + entry.bugsOpen + ')',
    '',
    '## Log completo',
    '- ' + entry.runFile,
  ].join('\n');
  fs.writeFileSync(memMdFile, content, 'utf8');

  return { saved: true, file: path.relative(PROJECT_ROOT, memMdFile) };
}

async function updateSkillContext(summary) {
  const skillPath = path.join(PROJECT_ROOT, 'agents', 'driveman-context.md');
  if (!fs.existsSync(skillPath)) return { updated: false, reason: 'skill no existe' };

  const content = fs.readFileSync(skillPath, 'utf8');
  const markerStart = '<!-- AGENT_STATE_START -->';
  const markerEnd = '<!-- AGENT_STATE_END -->';
  const startIdx = content.indexOf(markerStart);
  const endIdx = content.indexOf(markerEnd);
  if (startIdx === -1 || endIdx === -1) return { updated: false, reason: 'markers no encontrados' };

  const newBlock = [
    markerStart,
    '',
    '**Última corrida**: ' + summary.current.timestamp,
    '',
    '**Resumen rápido**:',
    '- Passed: ' + summary.current.passed + ' / ' + summary.current.total,
    '- Failed: ' + summary.current.failed,
    '- Skipped: ' + summary.current.skipped,
    '- Duración: ' + summary.current.duration + 's',
    '- Bugs abiertos: ' + summary.bugsOpen,
    '- Status: ' + summary.current.status,
    '',
    '**Delta vs corrida anterior**:',
    '- Mejoraron: ' + summary.delta.improved,
    '- Regresiones: ' + summary.delta.regressed,
    '- Sin cambios: ' + summary.delta.unchanged,
    '',
    '_Para detalle completo ver `tests/.runs/LATEST.md` y `agents/.memory/memory.md`._',
    '',
    markerEnd,
  ].join('\n');

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + markerEnd.length);
  const updated = before + newBlock + after;

  fs.writeFileSync(skillPath, updated, 'utf8');
  return { updated: true, file: path.relative(PROJECT_ROOT, skillPath) };
}

async function main() {
  log('iniciando test-runner agent');

  if (!fs.existsSync(RUNS_DIR)) {
    err('directorio de runs no existe: ' + RUNS_DIR);
    err('corre primero: npm run test:log');
    process.exit(2);
  }

  killZombieElectrons();
  await sleep(1000);

  const { stdout, stderr, dur } = runSuite();
  log('suite finalizada en ' + dur + 's');

  const latestMd = readLatestRun();
  if (!latestMd) {
    err('no se pudo leer LATEST.md despues de la corrida');
    process.exit(2);
  }

  const current = parseRunMarkdown(latestMd);
  const previous = getPreviousRun();
  const summary = summarize(current, previous);

  printReport(summary);

  const files = fs.readdirSync(RUNS_DIR).filter(f => f.startsWith('run-') && f.endsWith('.md')).sort();
  const latestRunFile = path.join(RUNS_DIR, files[files.length - 1]);

  const mem = await saveToMemory(summary, latestRunFile);
  if (mem.saved) {
    log('memoria: guardada en ' + mem.file);
  } else {
    warn('memoria: ' + mem.reason);
    log('memoria: log persistente en ' + path.relative(PROJECT_ROOT, latestRunFile));
  }

  const skill = await updateSkillContext(summary);
  if (skill.updated) {
    log('skill: ' + skill.file + ' actualizada');
  } else {
    warn('skill: ' + skill.reason);
  }

  if (summary.current.failed > 0) {
    err('hay tests fallando — revisar log');
    process.exit(1);
  }
  log('agente finalizado OK');
}

main().catch(e => {
  err('error fatal: ' + e.message);
  console.error(e.stack);
  process.exit(1);
});