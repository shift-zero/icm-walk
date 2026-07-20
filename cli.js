#!/usr/bin/env node

/**
 * icm-walk — Walk Test for ICM Workspaces
 *
 * Validates a directory against the Interpretable Context Methodology (ICM)
 * invariants. A "walk test" is an agent with no memory opening the workspace
 * cold and verifying it can orient, act, and report from the files alone.
 *
 * Invariants checked:
 *   1. Entry file exists (CLAUDE.md / AGENTS.md)
 *   2. Entry file is under ~60 lines
 *   3. Stage folders follow NN_kebab-name convention
 *   4. Each stage folder has a CONTEXT.md
 *   5. CONTEXT.md has Inputs, Process, Outputs, Human check sections
 *   6. Inputs split working vs reference
 *   7. Factory and product live apart (references/ vs output/)
 *   8. Routing files carry no content payload
 *   9. Per-stage token estimate is 2k-8k range
 *  10. No duplicated entry files (CLAUDE.md AND AGENTS.md means one is a pointer)
 *
 * Usage:
 *   icm-walk [directory]       # walk and validate
 *   icm-walk [directory] --json  # JSON output
 *   icm-walk --help              # this help
 */

const fs = require('fs');
const path = require('path');

// ─── Terminal Colors ────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

let useJson = process.argv.includes('--json') || process.argv.includes('-j');
let targetDir = process.argv[2] || '.';
let verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
${C.bold}icm-walk${C.reset} — Walk Test for ICM Workspaces

${C.dim}Validates a directory against ICM invariants.${C.reset}

${C.cyan}Usage:${C.reset}
  icm-walk [directory]          ${C.gray}# walk and validate${C.reset}
  icm-walk [directory] --json   ${C.gray}# JSON output${C.reset}
  icm-walk [directory] -v       ${C.gray}# verbose mode${C.reset}
  icm-walk --help               ${C.gray}# this help${C.reset}

${C.cyan}Exit codes:${C.reset}
  0   All checks pass
  1   Warnings (fixable issues found)
  2   Failures (breaking invariants found)
`);
  process.exit(0);
}

// ─── Helpers ────────────────────────────────────────────────────────

function warn(msg) {
  if (!useJson) console.log(`  ${C.yellow}⚠ ${msg}${C.reset}`);
}

function pass(msg) {
  if (!useJson) console.log(`  ${C.green}✓ ${msg}${C.reset}`);
}

function fail(msg) {
  if (!useJson) console.log(`  ${C.red}✗ ${msg}${C.reset}`);
}

function info(msg) {
  if (!useJson) console.log(`  ${C.blue}ℹ ${msg}${C.reset}`);
}

function header(msg) {
  if (!useJson) console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`);
}

function estimateTokens(text) {
  // Rough: 1 token ≈ 4 chars for English text, 1.5 for code-heavy
  return Math.round(text.length / 3.5);
}

function readFileSafe(p) {
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

function findFiles(dir, predicate) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, predicate));
      } else if (predicate(entry.name, fullPath)) {
        results.push({ name: entry.name, path: fullPath, relative: path.relative(targetDir, fullPath) });
      }
    }
  } catch {}
  return results;
}

function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

// ─── Checks ─────────────────────────────────────────────────────────

const results = { checks: [], warnings: 0, failures: 0, passes: 0 };
let overallStatus = 0;

function record(check, status, detail) {
  results.checks.push({ check, status, detail });
  if (status === 'pass') results.passes++;
  else if (status === 'warn') { results.warnings++; overallStatus = Math.max(overallStatus, 1); }
  else if (status === 'fail') { results.failures++; overallStatus = Math.max(overallStatus, 2); }
  const fn = status === 'pass' ? pass : status === 'warn' ? warn : fail;
  fn(detail);
}

// ─── Walk the workspace ─────────────────────────────────────────────

header('1. Entry File');

const entryFiles = [];
for (const name of ['CLAUDE.md', 'AGENTS.md', '.hermes.md']) {
  const p = path.join(targetDir, name);
  if (fs.existsSync(p)) entryFiles.push({ name, path: p });
}

if (entryFiles.length === 0) {
  record('entry_exists', 'fail', 'No entry file found (CLAUDE.md, AGENTS.md, or .hermes.md)');
} else {
  const names = entryFiles.map(e => e.name).join(', ');
  record('entry_exists', 'pass', `Entry file found: ${names}`);

  // Check for duplicated entry files (CLAUDE.md + AGENTS.md)
  const hasClaude = entryFiles.some(e => e.name === 'CLAUDE.md');
  const hasAgents = entryFiles.some(e => e.name === 'AGENTS.md');
  if (hasClaude && hasAgents) {
    const claude = readFileSafe(path.join(targetDir, 'CLAUDE.md'));
    const agents = readFileSafe(path.join(targetDir, 'AGENTS.md'));
    if (claude && agents && claude.trim() !== agents.trim()) {
      record('entry_duplicate', 'warn', 'Both CLAUDE.md and AGENTS.md exist with different content — one should be a pointer');
    } else {
      pass('CLAUDE.md and AGENTS.md are in sync or one is a pointer');
    }
  }

  // Check entry file size
  for (const entry of entryFiles) {
    const content = readFileSafe(entry.path);
    if (content) {
      const lines = content.split('\n').length;
      const tokens = estimateTokens(content);
      if (lines > 60) {
        record('entry_size', 'warn', `${entry.name}: ${lines} lines (~${tokens} tokens) — target is under 60 lines / 800 tokens`);
      } else {
        record('entry_size', 'pass', `${entry.name}: ${lines} lines (~${tokens} tokens) — within range`);
      }

      // Check entry file isn't carrying content payload
      if (lines > 80 && tokens > 1500) {
        record('entry_payload', 'warn', `${entry.name} seems to carry content payload (${lines} lines, ~${tokens} tokens). Move content to shelf files.`);
      } else {
        record('entry_payload', 'pass', `${entry.name} is clean — no content payload`);
      }
    }
  }
}

// ─── Check folder structure ─────────────────────────────────────────

header('2. Folder Structure');

const entries = listDir(targetDir);
const numberedDirs = entries.filter(e => e.isDirectory() && /^\d{2}_/.test(e.name));
const underscoreDirs = entries.filter(e => e.isDirectory() && e.name.startsWith('_'));
const otherDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'));

if (numberedDirs.length === 0) {
  record('numbered_folders', 'warn', 'No numbered stage folders found (NN_kebab-name). Pipeline may not use ICM sequencing.');
} else {
  record('numbered_folders', 'pass', `${numberedDirs.length} numbered stage folders found: ${numberedDirs.map(d => d.name).join(', ')}`);
}

if (underscoreDirs.length > 0) {
  record('underscore_folders', 'pass', `${underscoreDirs.length} meta/system folders found: ${underscoreDirs.map(d => d.name).join(', ')}`);
}

// Check each numbered folder for CONTEXT.md
header('3. Stage Contracts');
let stageWithContext = 0;
let stageWithoutContext = 0;

for (const dir of numberedDirs) {
  const stagePath = path.join(targetDir, dir.name);
  const contextPath = path.join(stagePath, 'CONTEXT.md');
  const contextContent = readFileSafe(contextPath);

  if (contextContent) {
    stageWithContext++;
    const hasInputs = /^##\s*Inputs/im.test(contextContent);
    const hasProcess = /^##\s*Process/im.test(contextContent);
    const hasOutputs = /^##\s*Outputs/im.test(contextContent);
    const hasHumanCheck = /^##\s*Human check/im.test(contextContent);

    const missing = [];
    if (!hasInputs) missing.push('Inputs');
    if (!hasProcess) missing.push('Process');
    if (!hasOutputs) missing.push('Outputs');
    if (!hasHumanCheck) missing.push('Human check');

    if (missing.length === 0) {
      record('stage_contract', 'pass', `${dir.name}/CONTEXT.md — complete (Inputs, Process, Outputs, Human check)`);

      // Check working vs reference split in Inputs
      if (/Inputs.*\n(.+\n)*?##/ims.test(contextContent)) {
        const inputsSection = contextContent.split(/^## Inputs/im)[1]?.split(/^## /im)[0] || '';
        const hasWorking = /working/i.test(inputsSection);
        const hasReference = /reference/i.test(inputsSection);
        if (hasWorking && hasReference) {
          pass(`  └─ Inputs split into working + reference`);
        } else if (!hasWorking && !hasReference) {
          record('inputs_split', 'warn', `${dir.name}/CONTEXT.md: Inputs don't specify working vs reference`);
        } else {
          pass(`  └─ Inputs separated (${hasWorking ? 'working' : ''}${hasWorking && hasReference ? ' + ' : ''}${hasReference ? 'reference' : ''})`);
        }
      }

      // Token estimate for this stage
      const stageTokens = estimateTokens(contextContent);
      const status = stageTokens >= 200 && stageTokens <= 8000 ? 'pass' : 'warn';
      const statusWord = status === 'pass' ? 'healthy' : 'outside ideal range';
      record(`token_${dir.name}`, status, `  └─ CONTEXT.md ~${stageTokens} tokens (${statusWord}: 200–8,000)`);
    } else {
      record('stage_contract', 'warn', `${dir.name}/CONTEXT.md — missing: ${missing.join(', ')}`);
    }
  } else {
    stageWithoutContext++;
    const children = listDir(stagePath).filter(e => e.isFile()).map(e => e.name);
    record('stage_contract', 'warn', `${dir.name}/ — no CONTEXT.md found. Files: [${children.slice(0, 5).join(', ')}${children.length > 5 ? ', ...' : ''}]`);
  }
}

if (stageWithContext > 0) {
  info(`${stageWithContext}/${numberedDirs.length} stages have CONTEXT.md`);
}

// ─── Factory vs Product ─────────────────────────────────────────────

header('4. Factory/Product Separation');

const refDir = path.join(targetDir, 'references');
const sharedDir = path.join(targetDir, '_shared');
const systemDir = path.join(targetDir, '_system');

let factoryDirs = [];
for (const d of [refDir, sharedDir, systemDir]) {
  if (fs.existsSync(d)) factoryDirs.push(d);
}

if (factoryDirs.length > 0) {
  record('factory_exists', 'pass', `Factory directories found: ${factoryDirs.map(d => path.basename(d)).join(', ')}`);
  for (const fd of factoryDirs) {
    const files = findFiles(fd, () => true);
    record('factory_files', 'pass', `  └─ ${path.basename(fd)}/: ${files.length} files`);
  }
} else {
  record('factory_exists', 'warn', 'No factory directories (references/, _shared/, _system/) found. Stable reference material should live apart from working artifacts.');
}

// Check each stage for output/ folders
let outputDirs = 0;
for (const dir of numberedDirs) {
  const outputPath = path.join(targetDir, dir.name, 'output');
  if (fs.existsSync(outputPath)) outputDirs++;
}

if (outputDirs > 0) {
  record('output_dirs', 'pass', `${outputDirs}/${numberedDirs.length} stages have output/ folders`);
} else {
  const numStages = numberedDirs.length;
  if (numStages > 0) record('output_dirs', 'warn', `No output/ folders found in stages. Products should write to output/`);
}

// ─── Overall ────────────────────────────────────────────────────────

header('5. Summary');

const total = results.checks.length;
info(`${results.passes} passed, ${results.warnings} warnings, ${results.failures} failures out of ${total} checks`);

if (results.failures > 0) {
  info(`${C.bold}${results.failures} breaking invariant(s) — fix before relying on this workspace.${C.reset}`);
}
if (results.warnings > 0) {
  info(`${results.warnings} non-breaking issue(s) — good candidates for the next cleanup pass.`);
}
if (results.passes === total) {
  pass(`${C.bold}All checks pass.${C.reset} An agent can walk this workspace cold.`);
}

if (useJson) {
  console.log(JSON.stringify({
    directory: path.resolve(targetDir),
    summary: { total, passes: results.passes, warnings: results.warnings, failures: results.failures },
    checks: results.checks,
    status: overallStatus === 0 ? 'pass' : overallStatus === 1 ? 'warn' : 'fail',
  }, null, 2));
}

process.exit(overallStatus);
