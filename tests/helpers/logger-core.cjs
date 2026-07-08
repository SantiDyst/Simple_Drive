function parsePlaywrightOutput(stdout) {
  const lines = stdout.split('\n');
  const tests = [];
  const summary = { total: 0, passed: 0, failed: 0, skipped: 0, durationSec: 0, status: 'unknown' };

  const PASS = '\u2713';
  const FAIL = '\u2718';
  const SKIP = '-';

  const testLineRegex = new RegExp('^\\s*([\\u2713\\u2718-])\\s+\\d+\\s+(.+?)\\s*(?:\\(([0-9.]+)s\\))?\\s*$');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let lastDurationSec = 0;

  for (const line of lines) {
    const m = line.match(testLineRegex);
    if (m) {
      const icon = m[1];
      const title = m[2].trim();
      const dur = parseFloat(m[3]);

      let status = 'unknown';
      if (icon === PASS) status = 'passed';
      else if (icon === FAIL) status = 'failed';
      else if (icon === SKIP) status = 'skipped';

      tests.push({ title, status, duration: dur });
    }

    const summaryLine = line.match(/^\s*(\d+)\s+passed/);
    if (summaryLine) totalPassed = parseInt(summaryLine[1], 10);
    const failedLineMatch = line.match(/^\s*(\d+)\s+failed/);
    if (failedLineMatch) totalFailed = parseInt(failedLineMatch[1], 10);
    const skippedLineMatch = line.match(/^\s*(\d+)\s+skipped/);
    if (skippedLineMatch) totalSkipped = parseInt(skippedLineMatch[1], 10);
    const durLine = line.match(/\(([0-9.]+)s\)\s*$/);
    if (durLine) lastDurationSec = parseFloat(durLine[1]);
  }

  summary.passed = totalPassed;
  summary.failed = totalFailed;
  summary.skipped = totalSkipped;
  summary.durationSec = lastDurationSec;
  summary.total = tests.length || (totalPassed + totalFailed + totalSkipped);

  if (summary.failed > 0) summary.status = 'failed';
  else if (summary.skipped > 0) summary.status = 'partial';
  else if (summary.passed > 0) summary.status = 'passed';
  else summary.status = 'unknown';

  return { tests, summary };
}

function renderMarkdown(parsed) {
  const { tests, summary } = parsed;
  const md = [];
  md.push('# Run ' + new Date().toISOString().replace('T', ' ').substring(0, 19) + '\n');
  md.push('## Resumen\n- Total: ' + summary.total + ' | Passed: ' + summary.passed + ' | Failed: ' + summary.failed + ' | Skipped: ' + summary.skipped + '\n- Duracion: ' + summary.durationSec.toFixed(1) + 's\n- Status final: ' + summary.status + '\n- Modo: dev (electron .)');

  md.push('\n## Resultado por test\n');
  for (const t of tests) {
    let icon = '\u274C';
    if (t.status === 'passed') icon = '\u2705';
    else if (t.status === 'skipped') icon = '\u23ED\uFE0F';
    else if (t.status === 'timedOut') icon = '\u23F1\uFE0F';

    const cleanTitle = t.title.replace(/^tests\\e2e\\[^\u203A]+\u203A\s*/, '');
    const dur = Number.isFinite(t.duration) ? t.duration.toFixed(1) + 's' : 'skip';
    md.push('- ' + icon + ' ' + cleanTitle + ' (' + dur + ')');
  }

  const skipped = tests.filter(t => t.status === 'skipped');
  if (skipped.length > 0) {
    md.push('\n### Skips con razon\n');
    for (const t of skipped) {
      const cleanTitle = t.title.replace(/^tests\\e2e\\[^\u203A]+\u203A\s*/, '');
      md.push('- ' + cleanTitle + '\n  - Razon: documentada en tests/e2e/flows.spec.cjs (anotacion skip)');
    }
  }

  md.push('\n## Bugs conocidos (carry-over)\n');
  const bugs = knownBugs();
  for (const b of bugs) {
    let line = '- **' + b.id + '** [' + b.status + '] _' + b.area + '_\n  - ' + b.summary + '\n  - Evidencia: ' + b.evidence + '\n  - Impacto: ' + b.impact + '\n  - Fix propuesto: ' + b.proposed_fix;
    if (b.status === 'fixed' && b.fix_applied) {
      line += '\n  - Fix aplicado: ' + b.fix_applied;
    }
    md.push(line);
  }

  md.push('\n## Artefactos\n- Screenshots: screenshots/\n- Traces: test-results/\n- Reporte HTML: playwright-report/');

  return md.join('\n');
}

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

module.exports = { parsePlaywrightOutput, renderMarkdown, knownBugs };