#!/usr/bin/env node

/**
 * icm-walk — Walk Test for ICM Workspaces
 *
 * Validates a directory against the Interpretable Context Methodology (ICM)
 * invariants. A "walk test" is an agent with no memory opening the workspace
 * cold and verifying it can orient, act, and report from the files alone.
 *
 * Invariants checked (default mode):
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
 * Cursor evaluation mode (--cursor):
 *   Evaluates a workspace's readiness for Cursor/agent-based coding.
 *   Checks Cursor config files, entry points, context sizing, and structure.
 *
 * Usage:
 *   icm-walk [directory]            # walk and validate
 *   icm-walk [directory] --json     # JSON output
 *   icm-walk [directory] --cursor   # cursor evaluation mode
 *   icm-walk --help                 # this help
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
let cursorMode = process.argv.includes('--cursor');
let targetDir = process.argv[2] || '.';
let verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

if (cursorMode && process.argv[2] && !process.argv[2].startsWith('-')) {
  targetDir = process.argv[2];
} else if (cursorMode && process.argv[1] && !process.argv[1].startsWith('-')) {
  targetDir = process.argv[1];
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
${C.bold}icm-walk${C.reset} — Walk Test for ICM Workspaces

${C.dim}Validates a directory against ICM invariants.${C.reset}

${C.cyan}Usage:${C.reset}
  icm-walk [directory]                ${C.gray}# walk and validate${C.reset}
  icm-walk [directory] --cursor       ${C.gray}# cursor evaluation mode${C.reset}
  icm-walk [directory] --json         ${C.gray}# JSON output${C.reset}
  icm-walk [directory] -v             ${C.gray}# verbose mode${C.reset}
  icm-walk --help                     ${C.gray}# this help${C.reset}

${C.cyan}Cursor evaluation mode (--cursor):${C.reset}
  Evaluates a workspace's readiness for Cursor/agent-based coding.
  Checks for:
  ${C.dim}·${C.reset} .cursorrules — exists, valid, meaningful rules
  ${C.dim}·${C.reset} .cursorignore — present when needed
  ${C.dim}·${C.reset} Entry file — Cursor-optimized sizing and structure
  ${C.dim}·${C.reset} Token budgets — files sized for Cursor context window
  ${C.dim}·${C.reset} Project docs — README, CONTRIBUTING, LICENSE
  ${C.dim}·${C.reset} Test structure — can Cursor help test effectively?
  ${C.dim}·${C.reset} Dependency clarity — package.json, config files findable

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
        // Skip hidden directories and generated dirs
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
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

if (cursorMode) {
  // In cursor mode, skip ICM walk and go straight to cursor evaluation
  runCursorEvaluation();
  process.exit(overallStatus);
}

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

// ─── Cursor Evaluation Mode ────────────────────────────────────────

function runCursorEvaluation() {
  results.checks = [];
  results.warnings = 0;
  results.failures = 0;
  results.passes = 0;
  overallStatus = 0;

  header('Cursor Mode: Workspace Agent-Readiness');
  info('Evaluating how well Cursor/agents can work with this workspace\n');

  // 1. Check .cursorrules
  const cursorRulesPath = path.join(targetDir, '.cursorrules');
  const cursorRules = readFileSafe(cursorRulesPath);
  if (cursorRules) {
    const rulesLines = cursorRules.split('\n').length;
    const rulesTokens = estimateTokens(cursorRules);
    if (rulesLines < 3) {
      record('cursor_rules', 'warn', '.cursorrules exists but is nearly empty (' + rulesLines + ' lines)');
    } else if (rulesTokens > 4000) {
      record('cursor_rules', 'warn', '.cursorrules is ' + rulesTokens + ' tokens — Cursor reads this every turn. Aim for under 2,000.');
    } else {
      record('cursor_rules', 'pass', '.cursorrules: ' + rulesLines + ' lines (~' + rulesTokens + ' tokens) — good');
    }
    // Check for specific rule categories
    const hasLang = /language|framework|stack|tech/i.test(cursorRules);
    const hasStyle = /style|convention|pattern|naming/i.test(cursorRules);
    const hasTesting = /test|spec|unit|integration/i.test(cursorRules);
    const categories = [];
    if (hasLang) categories.push('tech stack');
    if (hasStyle) categories.push('code style');
    if (hasTesting) categories.push('testing');
    if (categories.length === 0) {
      record('cursor_rules_categories', 'warn', '.cursorrules: no clear categories detected (tech stack, code style, testing)');
    } else {
      record('cursor_rules_categories', 'pass', '.cursorrules covers: ' + categories.join(', '));
    }
  } else {
    record('cursor_rules', 'fail', 'No .cursorrules found. Cursor works without one, but rules significantly improve output quality.');
  }

  // 2. Check .cursorignore
  const cursorIgnorePath = path.join(targetDir, '.cursorignore');
  const cursorIgnore = readFileSafe(cursorIgnorePath);
  if (cursorIgnore) {
    const patterns = cursorIgnore.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
    record('cursor_ignore', 'pass', '.cursorignore: ' + patterns + ' ignore pattern(s)');
  } else {
    // Not always needed — only warn if there are generated dirs
    const hasNodeModules = fs.existsSync(path.join(targetDir, 'node_modules'));
    const hasDist = fs.existsSync(path.join(targetDir, 'dist')) || fs.existsSync(path.join(targetDir, 'build'));
    const hasVenv = fs.existsSync(path.join(targetDir, '.venv')) || fs.existsSync(path.join(targetDir, 'venv'));
    const genDirs = [];
    if (hasNodeModules) genDirs.push('node_modules');
    if (hasDist) genDirs.push('dist/build');
    if (hasVenv) genDirs.push('.venv');
    if (genDirs.length > 0) {
      record('cursor_ignore', 'warn', 'No .cursorignore found, but generated directories detected (' + genDirs.join(', ') + '). Cursor may index unnecessary files.');
    } else {
      record('cursor_ignore', 'pass', 'No .cursorignore needed (no generated directories detected)');
    }
  }

  // 3. Check entry file
  const entryFileNames = ['CLAUDE.md', 'AGENTS.md', '.hermes.md', 'README.md'];
  let foundEntry = null;
  for (const name of entryFileNames) {
    const p = path.join(targetDir, name);
    if (fs.existsSync(p)) {
      foundEntry = { name, path: p };
      break;
    }
  }
  if (foundEntry) {
    const content = readFileSafe(foundEntry.path);
    const lines = content.split('\n').length;
    const tokens = estimateTokens(content);
    let entryAdvice = '';

    if (tokens > 2000) {
      entryAdvice = ' but long (' + tokens + ' tokens). Cursor reads the full file each turn — consider trimming to ~500 tokens.';
      record('entry_file', 'warn', foundEntry.name + ': ' + lines + ' lines, ~' + tokens + ' tokens.' + entryAdvice);
    } else if (tokens > 800) {
      entryAdvice = ' — moderate size (' + tokens + ' tokens). Consider trimming if this is read every turn.';
      record('entry_file', 'pass', foundEntry.name + ': ' + lines + ' lines, ~' + tokens + ' tokens.' + entryAdvice);
    } else {
      record('entry_file', 'pass', foundEntry.name + ': ' + lines + ' lines, ~' + tokens + ' tokens — Cursor-friendly size');
    }

    // Check for Cursor-specific hints
    if (content.includes('@cursor') || content.includes('Cursor')) {
      pass('  └─ Contains Cursor-specific guidance');
    } else {
      record('entry_cursor_hints', 'warn', 'Entry file has no Cursor-specific guidance. Consider adding rules tailored to Cursor\'s behavior.');
    }
  } else {
    record('entry_file', 'fail', 'No entry file found (CLAUDE.md, AGENTS.md, .hermes.md, or README.md). Cursor needs at least a README to orient.');
  }

  // 4. Check README
  const readmePath = path.join(targetDir, 'README.md');
  const readme = readFileSafe(readmePath);
  if (readme) {
    const readmeLines = readme.split('\n').length;
    if (readmeLines < 10) {
      record('readme', 'warn', 'README.md is only ' + readmeLines + ' lines. Cursor uses README as primary orientation — add a project description, setup, and usage.');
    } else {
      const hasSetup = /install|setup|quick.?start|get.?started|prerequisites/i.test(readme);
      const hasUsage = /usage|example|run|build|test|cargo|npm|python/i.test(readme);
      if (hasSetup && hasUsage) {
        record('readme', 'pass', 'README.md: ' + readmeLines + ' lines with setup and usage docs');
      } else {
        record('readme', 'warn', 'README.md exists but may lack setup or usage sections. Cursor relies on these for context.');
      }
    }
  } else {
    record('readme', 'fail', 'No README.md found. Cursor has no primary orientation document.');
  }

  // 5. Check .gitignore
  const gitignorePath = path.join(targetDir, '.gitignore');
  const gitignore = readFileSafe(gitignorePath);
  if (gitignore) {
    const patterns = gitignore.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
    record('gitignore', 'pass', '.gitignore: ' + patterns + ' pattern(s) — Cursor respects gitignore');
  } else {
    record('gitignore', 'warn', 'No .gitignore. Cursor may index build artifacts and dependencies.');
  }

  // 6. Check package.json or equivalent
  const packageJsonPath = path.join(targetDir, 'package.json');
  const pyprojectPath = path.join(targetDir, 'pyproject.toml');
  const cargoPath = path.join(targetDir, 'Cargo.toml');
  let manifestFound = null;
  if (fs.existsSync(packageJsonPath)) manifestFound = 'package.json';
  else if (fs.existsSync(pyprojectPath)) manifestFound = 'pyproject.toml';
  else if (fs.existsSync(cargoPath)) manifestFound = 'Cargo.toml';

  if (manifestFound) {
    record('manifest', 'pass', manifestFound + ' found — Cursor can resolve dependencies');
  } else {
    record('manifest', 'warn', 'No package.json, pyproject.toml, or Cargo.toml found. Cursor may lack dependency context.');
  }

  // 7. Check test structure
  const testDir =
    fs.existsSync(path.join(targetDir, 'test')) ? 'test/' :
    fs.existsSync(path.join(targetDir, 'tests')) ? 'tests/' :
    fs.existsSync(path.join(targetDir, '__tests__')) ? '__tests__/' :
    null;
  if (testDir) {
    const testFiles = findFiles(path.join(targetDir, testDir), (name) => /\.(test|spec)\./.test(name) || name.endsWith('_test.go') || name.endsWith('_test.py'));
    const testCount = testFiles.length > 0 ? testFiles.length :
      fs.readdirSync(path.join(targetDir, testDir)).filter(f => f.endsWith('.py') || f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.rs')).length;
    if (testCount > 0) {
      record('tests', 'pass', 'Test directory found (' + testDir + ') with ' + testCount + ' test file(s)');
    } else {
      record('tests', 'warn', 'Test directory exists (' + testDir + ') but no test files detected');
    }
  } else {
    // Check for test files in root
    const rootTestFiles = findFiles(targetDir, (name) => /\.(test|spec)\./.test(name));
    if (rootTestFiles.length > 0) {
      record('tests', 'pass', rootTestFiles.length + ' test file(s) found in root');
    } else {
      record('tests', 'warn', 'No test directory or test files found. Cursor helps most effectively when tests exist.');
    }
  }

  // 8. File size distribution — are files Cursor-friendly?
  header('8. File Size Distribution');
  const allFiles = findFiles(targetDir, (name) => /\.(js|ts|py|rs|go|md|json|yaml|yml|toml|css|html|jsx|tsx)$/.test(name) && !name.startsWith('.'));
  if (allFiles.length > 0) {
    let small = 0, medium = 0, large = 0, huge = 0;
    for (const f of allFiles) {
      const content = readFileSafe(f.path);
      if (content) {
        const tokens = estimateTokens(content);
        if (tokens < 200) small++;
        else if (tokens < 800) medium++;
        else if (tokens < 3000) large++;
        else huge++;
      }
    }
    const total = small + medium + large + huge;
    const pct = (n) => Math.round(n / total * 100);

    info(total + ' source files — ' + pct(small) + '% under 200t, ' + pct(medium) + '% 200–800t, ' + pct(large) + '% 800–3kt, ' + pct(huge) + '% over 3kt');

    if (huge > 0) {
      record('file_sizes', 'warn', huge + " file(s) over 3,000 tokens. Cursor's context window is limited — consider splitting large files.");
    } else if (large > total * 0.3) {
      record('file_sizes', 'warn', pct(large) + '% of files are 800–3,000 tokens. Consider keeping most under 800 for Cursor context efficiency.');
    } else if (medium + small === total) {
      record('file_sizes', 'pass', 'All files are under 800 tokens — Cursor-friendly sizing');
    } else {
      record('file_sizes', 'pass', 'File size distribution is reasonable');
    }
  } else {
    record('file_sizes', 'warn', 'No source files found to analyze');
  }

  // 9. Check for TypeScript config (if TS project)
  const tsconfigPath = path.join(targetDir, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    record('tsconfig', 'pass', 'tsconfig.json found — Cursor can provide accurate TypeScript intellisense');
  }

  // 10. Summary
  header('Cursor Evaluation Summary');
  const cursorTotal = results.checks.length;
  info(results.passes + ' passed, ' + results.warnings + ' warnings, ' + results.failures + ' failures out of ' + cursorTotal + ' checks');

  if (results.failures === 0 && results.warnings === 0) {
    pass(C.bold + 'Workspace is Cursor-optimized. An agent can work here effectively.' + C.reset);
  } else if (results.failures === 0) {
    info(C.bold + 'Minor issues — workspace is mostly Cursor-ready.' + C.reset);
  } else {
    info(C.bold + results.failures + ' critical issue(s) — fix these for effective Cursor/agent collaboration.' + C.reset);
  }

  if (useJson) {
    console.log(JSON.stringify({
      mode: 'cursor',
      directory: path.resolve(targetDir),
      summary: { total: cursorTotal, passes: results.passes, warnings: results.warnings, failures: results.failures },
      checks: results.checks,
      status: overallStatus === 0 ? 'pass' : overallStatus === 1 ? 'warn' : 'fail',
    }, null, 2));
  }

  process.exit(overallStatus);
} // end runCursorEvaluation

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
