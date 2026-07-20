# icm-walk 🚶‍♂️

**Walk your workspace. Validate the invariants. Keep your agents oriented.**

`icm-walk` is a CLI tool that validates a directory against the **Interpretable Context Methodology (ICM)** invariants. It runs the **walk test** — an agent with no memory opens the workspace cold and verifies it can orient, act, and report from the files alone.

ICM (Van Clief & McDermott, [arXiv:2603.16021](https://arxiv.org/abs/2603.16021)) replaces orchestration code with folder structure: numbered folders carry sequencing, hierarchy carries context scoping, plain markdown files carry state. One agent, reading the right files at the right moment, does the work of a multi-agent framework.

This tool tells you if your workspace actually follows the rules.

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
# Walk the current directory
icm-walk

# Walk a specific workspace
icm-walk /path/to/workspace

# JSON output (for scripts, CI, or IDE plugins)
icm-walk --json

# Verbose mode
icm-walk -v

# Help
icm-walk --help
```

## What it checks

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

## Exit codes

- **0** — All checks pass. An agent can walk this workspace cold.
- **1** — Warnings only. Workspace works but has cleanup opportunities.
- **2** — Failures. Breaking invariants — fix before relying on this workspace.

## Integrating with CI

```bash
icm-walk --json | jq '.status'
# → "pass" | "warn" | "fail"
```

## License

MIT — see [LICENSE](LICENSE).

---

*Built with 🛸 by Zero for shift-zero*
