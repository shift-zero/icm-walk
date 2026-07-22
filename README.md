# icm-walk 🚶‍♂️

**Walk your workspace. Validate the invariants. Keep your agents oriented.**

`icm-walk` is a CLI tool that evaluates workspaces against methodology invariants.
It supports multiple evaluation modes via feature flags.

## Install

```bash
npm install -g icm-walk
```

Or run directly:

```bash
npx icm-walk
```

## Usage

```bash
# ICM Walk (default) — validates ICM workspace structure
icm-walk [directory]               # shorthand — default mode
icm-walk [directory] --icm         # explicit ICM walk

# Cursor Evaluation — checks workspace readiness for Cursor/agent coding
icm-walk [directory] --cursor

# JSON output (works with any mode)
icm-walk [directory] --cursor --json

# Verbose
icm-walk -v

# Help
icm-walk --help
```

## Evaluation Modes

### `--icm` — ICM Walk (default)

Validates a directory against the **Interpretable Context Methodology (ICM)**
invariants. Runs the **walk test** — an agent with no memory opens the workspace
cold and verifies it can orient, act, and report from the files alone.

ICM (Van Clief & McDermott, [arXiv:2603.16021](https://arxiv.org/abs/2603.16021))
replaces orchestration code with folder structure: numbered folders carry
sequencing, hierarchy carries context scoping, plain markdown files carry state.

| # | Invariant | What happens if it fails |
|---|-----------|--------------------------|
| 1 | Entry file exists (`CLAUDE.md`, `AGENTS.md`, or `.hermes.md`) | Agent can't orient — fails before starting |
| 2 | Entry file under ~60 lines / ~800 tokens | Bloated routing = agent loses the map |
| 3 | Routing files carry no content payload | Content in routing files = context-blown entry point |
| 4 | Stage folders follow `NN_kebab-name` convention | Pipeline sequence is guesswork |
| 5 | Each stage folder has a `CONTEXT.md` | Agent enters a folder blind |
| 6 | `CONTEXT.md` has Inputs, Process, Outputs, Human check | Missing sections = agent makes up the workflow |
| 7 | Inputs split working vs reference | Agent can't tell fresh data from ground truth |
| 8 | Factory directories exist (`references/`, `_shared/`) | Stable knowledge mingles with per-run artifacts |
| 9 | Output folders exist per stage | Products have no home — next stage can't find them |
| 10 | Token estimate per stage in 200–8,000 range | Bloated stages blow context windows |

### `--cursor` — Cursor Evaluation

Evaluates a workspace's readiness for **Cursor/agent-based coding**. Checks
that your project is configured so an AI coding agent can work effectively.

| # | Check | What it looks for |
|---|-------|-------------------|
| 1 | `.cursorrules` | Exists, sized under 2,000 tokens, covers tech stack, code style, and testing |
| 2 | `.cursorignore` | Present when generated dirs exist (node_modules, .venv, dist) |
| 3 | Entry file | Sized for Cursor's context window (target < 800 tokens) |
| 4 | Cursor hints | Entry file contains Cursor-specific guidance (optional) |
| 5 | README | Has setup and usage sections — Cursor uses this as primary orientation |
| 6 | `.gitignore` | Present — Cursor respects it to skip build artifacts |
| 7 | Dependency manifest | `package.json`, `pyproject.toml`, or `Cargo.toml` found |
| 8 | Tests | Test directory or test files exist |
| 9 | File size distribution | Analyzes all source files, flags anything over 3,000 tokens |
| 10 | tsconfig.json | Bonus check for TypeScript projects |

```bash
# Quick read on a project
icm-walk /path/to/project --cursor

# CI pipeline check
icm-walk /path/to/project --cursor --json | jq '.status'
```

## Exit codes

- **0** — All checks pass. Workspace is healthy.
- **1** — Warnings only. Workspace works but has cleanup opportunities.
- **2** — Failures. Breaking invariants — fix before relying on this workspace.

## Integrating with CI

```bash
# ICM mode CI check
icm-walk --icm --json | jq '.status'

# Cursor mode CI check
icm-walk --cursor --json | jq '.status'
```

## License

MIT — see [LICENSE](LICENSE).

---

*Built with 🛸 by Zero for shift-zero*
