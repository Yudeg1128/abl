# Autonomous Build Loop (ABL)
## Concept Formalization v0.8

---

## Problem Statement

LLM-assisted development workflows that mirror human sprint team structures are inefficient because the orchestration burden falls on the human, role-playing generates fictional artifacts, and token usage is spent on organizational theater rather than intelligence. ABL eliminates all of this.

---

## Core Concept

A phase-based autonomous build loop where the human writes specs and performs final audit. Everything in between is automatic. The orchestration is handled by a Node.js CLI. The LLM engine is Gemini CLI.

---

## Mental Model

```
Specs → [abl phase N] → Verified output → Human audit → approve or refine specs → next phase
```

The human touches the system exactly twice per phase: spec input and audit output.

---

## Roles

**Builder** — reads the dynamically injected phase and iteration, pulls the current phase spec from `specs/`, reads the codebase. Implements contracts exactly. If `failed_specs.md` exists, fixes those first. Manages its own technical quality using project-defined `abl-cmd` tools (lint, typecheck, migrations). Produces a Builder Run Report before finishing.

**Verifier** — reads the dynamically injected phase and iteration, pulls all cumulative specs from `specs/`, tests the live running system. Prepares the test environment using project-defined `abl-cmd` tools (seeding, starting server). Reports failures via `failed_specs.md`. Never reads source code. Produces a Verifier Run Report before finishing.

There is no Rectifier. The Builder is the only entity that touches code.

---

## Information Boundaries

| Role | Reads | Never reads |
|---|---|---|
| Builder | specs/ + SRC_DIR codebase + failed_specs.md | TESTS_DIR, prompts/verifier.md |
| Verifier | specs/ + TESTS_DIR + failed_specs.md | SRC_DIR |

Boundaries are enforced by **Docker**. Each role runs in an isolated container. `specs/` is mounted read-only for both roles.

---

## Communication Channel: Builder ↔ Verifier

The Verifier passes failures to the Builder via `TESTS_DIR/failed_specs.md`. Each entry contains the failed contract, the exact input used, and the observed system behavior. Written entirely in spec language — no test code, no test output, no implementation details.

Format:

```
SPEC: POST /auth/login {valid credentials} → 200 {token}
INPUT: {"email": "test@test.com", "password": "correct"}
OBSERVED: 404

SPEC: GET /dashboard (valid token) → 200
INPUT: GET /dashboard headers: {Authorization: Bearer <token>}
OBSERVED: redirect /login
```

INPUT is mandatory — the Builder must know exactly what stimulus triggered the failure.

**Pass/fail signal:** The presence of `failed_specs.md` containing at least one `SPEC:` entry means failure. Absence or empty file means pass.

---

## Git Strategy

Two separate git repositories — one in SRC_DIR, one in TESTS_DIR. The Docker boundary extends into version control. Neither role can traverse the other's git history.

---

## File Structure

```
project/
├── [SRC_DIR]/                # configurable — default "src"
│   ├── .git/
│   ├── [all application code]
│   └── builder_reports/      # Builder's iteration reports
├── .abl/
│   ├── tests/                # Verifier's workspace (configurable)
│   │   ├── .git/
│   │   ├── failed_specs.md   # Written by Verifier on failure, deleted on pass
│   │   └── verifier_reports/ # Verifier's iteration reports
│   ├── specs/
│   │   ├── phase1.md
│   │   └── phaseN.md
│   ├── logs/                 # Runtime artifacts
│   │   ├── builder.log       # Full Gemini CLI JSON output from Builder (last run)
│   │   ├── verifier.log      # Full Gemini CLI JSON output from Verifier (last run)
│   │   └── tokens.csv        # Cumulative token usage across all phases
│   ├── project.md            # Human-written project description
│   └── project_map.txt       # Auto-generated before every LLM call
├── .env                      # Secrets — gitignored, never passed to LLMs
└── prompts/
    ├── builder.md
    └── verifier.md
```

---

## The Loop

```
abl phase PHASE=N:
    - Initialize SRC_DIR/.git and TESTS_DIR/.git if not present
    - Initialize .abl/logs/tokens.csv
    - Inject <<PHASE>> and <<ITERATION>> into prompts

outer loop (max 5 Verifier iterations):

    Builder runs in Docker (SRC_DIR + specs/)
    Builder implements specs
    Builder runs self-checks via abl-cmd
    Builder writes report to src/builder_reports/
    git commit SRC_DIR: "phaseN/build/step-X"

    Verifier runs in Docker (tests/ + specs/)
    Verifier prepares environment via abl-cmd
    Verifier writes and runs tests
    Verifier writes report to tests/verifier_reports/
    → failed_specs.md absent or empty: ✓ PASS — surface to human
    → failed_specs.md has SPEC entries: FAIL
      git commit TESTS_DIR: "phaseN/verify/step-X"
      next outer iteration

outer loop exhausted (5 Verifier fails): STUCK (contracts) → surface failed_specs.md
```

---

## Continuous Phases

`abl phase N` is idempotent and resumable. The loop always picks up from where it left off based on the internal `state.json`.

---

## Token Tracking

Every Gemini call appends a row to `.abl/logs/tokens.csv`. View cumulative totals:
```bash
abl costs
```

---

## Spec and Phase Requirements

### What a Spec Is

A spec is a behavioral contract. It defines a specific action and a specific expected result with no room for interpretation. The Verifier must be able to derive a test from it without any implementation knowledge.

### Spec Format

**Context** — natural language intent, architecture decisions, constraints.

**Contracts** — exact quasi-code action → result pairs. One action, one result, no ambiguity.

```
ACTION → EXPECTED RESULT
```

### Spec Rules

- First line must be `# Phase N: Title`
- Specs are append-only across phases
- Cumulative: the Verifier tests ALL phases every iteration, not just the current one

---

## Environment and Security

**Docker** is the enforcement layer. Builder sees only SRC_DIR and specs/. Verifier sees only TESTS_DIR and specs/.

**Secrets** live in `.env` at project root, gitignored. The runner reads `GEMINI_API_KEY` from `.env` and passes it as an environment variable to the container.

---

## Human Audit

The human audits the phase output as a complete experience. Problems are addressed by refining specs — never by patching code directly. All corrections become permanent spec knowledge.
