#!/usr/bin/env node
/*
 * sync-check.cjs — verifica que el auditor y otros agentes/skills reflejen el estado real del repo.
 *
 * Uso:
 *   node agents/sync-check.cjs                       # default: --target=agents/auditor-driveman.md --days=7
 *   node agents/sync-check.cjs --days=14             # ventana de freshness
 *   node agents/sync-check.cjs --target=agents/<otro>.md
 *
 * Salida:
 *   exit 0 = sin issues
 *   exit 2 = issues de consistencia (gate bloqueante)
 *
 * Para invocar antes de pushear:
 *   "Antes de hacer push, corré `node agents/sync-check.cjs` y resolvé los issues que marque."
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
process.chdir(repoRoot);

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return '';
  }
}

function parseArgs(argv) {
  const out = { days: 7, target: 'agents/auditor-driveman.md' };
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--days=')) out.days = parseInt(arg.split('=')[1], 10) || 7;
    else if (arg.startsWith('--target=')) out.target = arg.split('=')[1];
  }
  return out;
}

function main() {
  const { days, target } = parseArgs(process.argv);
  const absTarget = path.resolve(repoRoot, target);

  if (!fs.existsSync(absTarget)) {
    console.error(`❌ Target no encontrado: ${target}`);
    console.error(`   Resolved: ${absTarget}`);
    process.exit(1);
  }

  const content = fs.readFileSync(absTarget, 'utf8');
  const headShort = git('rev-parse --short HEAD');
  const headFull = git('rev-parse HEAD');
  const headMessage = git('log -1 --pretty=%s');
  const headDate = git('log -1 --pretty=%cs');

  if (!headShort) {
    console.error('❌ No pude leer HEAD de git. ¿Estás en un repo?');
    process.exit(1);
  }

  const issues = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Último commit documentado
  const lastCommitMatch = content.match(/[Uu]ltimo commit:?\s*`?([0-9a-f]{4,40})`?/);
  if (lastCommitMatch) {
    const documented = lastCommitMatch[1];
    const matches = documented === headShort
      || headShort.startsWith(documented)
      || headFull.startsWith(documented);
    if (!matches) {
      issues.push(
        `Último commit documentado desactualizado. Documentado: \`${documented}\` — HEAD real: \`${headShort}\` (${headMessage})`
      );
    }
  }

  // 2. Freshness del estado (sesión YYYY-MM-DD)
  const sessionMatch = content.match(/Estado actual del proyecto \(sesión (\d{4}-\d{2}-\d{2})\)/);
  if (sessionMatch) {
    const documentedDate = new Date(sessionMatch[1] + 'T00:00:00');
    const diffDays = Math.floor((today - documentedDate) / (1000 * 60 * 60 * 24));
    if (diffDays > days) {
      issues.push(
        `Estado actual documentado con ${diffDays} días de antigüedad (sesión ${sessionMatch[1]}, threshold ${days}). Considerar actualizar.`
      );
    }
  }

  // 3. Suite count (busca "N/M verde" en cualquier contexto: "Suite: 26/26 verde" o "26/26 verde")
  const suiteMatch = content.match(/(\d+)\s*\/\s*(\d+)\s*verde/);
  if (suiteMatch) {
    const documentedPassed = parseInt(suiteMatch[1], 10);
    const documentedTotal = parseInt(suiteMatch[2], 10);
    if (documentedTotal < 20) {
      issues.push(
        `Suite count documentado sospechosamente bajo: ${documentedPassed}/${documentedTotal}. ¿Tests faltantes o desactualizado?`
      );
    }
  } else {
    issues.push(
      `No se encontró patrón "N/M verde" en ${target}. Considerar agregar para validación automática.`
    );
  }

  // 4. Historial reciente del target
  const recentOnTarget = git(`log --oneline -5 -- ${target}`);
  const recentInRepo = git('log --oneline -5');

  console.log(`🔍 sync-check — target: ${target}`);
  console.log(`   HEAD: ${headShort} (${headDate}) — ${headMessage}`);
  console.log(`   Umbral de freshness: ${days} días`);
  console.log();

  if (recentOnTarget) {
    console.log(`📜 Últimos 5 commits sobre ${target}:`);
    recentOnTarget.split('\n').forEach(l => console.log('   ' + l));
    console.log();
  }

  console.log(`📜 Últimos 5 commits del repo:`);
  recentInRepo.split('\n').forEach(l => console.log('   ' + l));
  console.log();

  if (issues.length === 0) {
    console.log(`✅ ${target} parece sincronizado con el estado actual del repo.`);
    process.exit(0);
  }

  console.log(`⚠️  ${target} tiene ${issues.length} posible(s) desfase(s):\n`);
  issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
  console.log();
  console.log('Resolver antes de pushear a origin (gate bloqueante).');
  process.exit(2);
}

main();
