# Autonomous Build Loop (ABL)
## Concept Formalization v0.9

---

## Problem Statement

LLM-assisted development workflows often suffer from high orchestration overhead for the human, fictional agent behavior (hallucinations), and inefficient token usage. ABL eliminates these by enforcing strict behavioral contracts and agent isolation.

---

## Core Concept

A phase-based autonomous build loop where the human provides specs and performs final audits. A Node.js CLI orchestrates two isolated AI roles—a **Builder** and a **Verifier**—to iteratively implement software.

```
Specs → [abl run] → Verified Output → Human Audit → Approve/Refine → Next Phase
```

---

## Roles

**Builder** — Resides in the source directory (`src/`). Implements contracts exactly. It has full shell access to its workspace and uses `abl-cmd` (e.g., `health_check`) to verify code integrity (linting, type-checking) before finishing its turn.

**Verifier** — Resides in the tests directory (`tests/`). Jailed from the source code. It writes and executes test scripts against the live system. It uses `abl-cmd` (e.g., `seed`, `start_dev`) as a capability bridge to manipulate the application state and start servers without internal code access.

---

## The `abl-cmd` Proxy Mechanism

Agents do not execute raw project commands. Instead, ABL generates a temporary binary called `abl-cmd` and injects it into the agent's `PATH`.
- **Capability Bridge:** Allows the jailed Verifier to execute specific scripts (database resets, server management) defined in `abl.config.yaml`.
- **Enforcement:** Forces the Builder to pass deterministic health checks before completing a turn.
- **Spec Access:** Provides `abl-cmd get-spec <N>` to allow agents to retrieve current and historical contracts.

---

## Interactive Mode (`-i` / `--interactive`)

The `-i` flag allows a human to monitor or debug an agent's turn in real-time.
- **Standard I/O:** Inherits the system shell (`stdio: inherit`).
- **Token Tracking:** Usage is NOT logged in interactive mode.
- **Session Control:** The human must manually type `/quit` to end the turn. ABL interprets any exit from interactive mode as a successful turn completion.

---

## Communication Channel: Builder ↔ Verifier

The Verifier communicates failures via `tests/failed_specs.md`.
- **Pass/Fail:** The presence of `failed_specs.md` with `SPEC:` entries triggers a new iteration.
- **Input Requirement:** Every entry must include the exact `INPUT` (payload/request) that triggered the `OBSERVED` failure.

---

## File Structure

```
project/
├── [src]/                    # Builder workspace
│   ├── .git/
│   └── builder_reports/      # Builder's logs
├── .abl/
│   ├── abl.config.yaml       # Configuration
│   ├── project.md            # High-level project context
│   ├── state.json            # Progress tracker
│   ├── specs/                # Phase contracts (phase1.md, etc.)
│   ├── prompts/              # System prompts (builder.md, verifier.md)
│   ├── logs/                 # dev.log, dev.pid, tokens.csv
│   └── lean_settings.json    # Gemini CLI settings
├── [tests]/                  # Verifier workspace
│   ├── .git/
│   ├── failed_specs.md       # Bridge file
│   └── verifier_reports/     # Verifier's logs
└── .env                      # GEMINI_API_KEY
```

---

## The Loop

```
abl run:
    - Sync state with Git history
    - Identify current Phase N / Iteration I

outer loop (max iterations defined in config):

    Builder (src/ + specs/):
    - Reads specs and previous failed_specs.md
    - Implements logic
    - Runs abl-cmd health_check
    - Commits code

    Verifier (tests/ + specs/):
    - Prepares environment via abl-cmd (seed/start_dev)
    - Writes and runs adversarial tests
    - Updates failed_specs.md
    - Commits test results

    Decision:
    - failed_specs.md empty? -> SUCCESS (Phase Complete)
    - failed_specs.md has entries? -> Next Iteration
```

---

## Token Tracking

Every non-interactive Gemini call is parsed for token usage and appended to `.abl/logs/tokens.csv`. Usage can be viewed via `abl costs`.

---

## Spec Requirements

- **Format:** `ACTION -> EXPECTED RESULT`
- **Rule:** Specs must be non-interpretable behavioral contracts.
- **Cumulative:** The Verifier is expected to test all previous phases to prevent regressions.

---

## Human Audit

The human performs the final sign-off. If the implementation is insufficient, the human refines the specs and restarts the loop. Patches are never applied directly to code; they are applied to the "law" (the specs).
```