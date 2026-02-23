# Autonomous Build Loop (ABL)
## Concept Formalization v0.7

---

## Problem Statement

LLM-assisted development workflows that mirror human sprint team structures are inefficient because the orchestration burden falls on the human, role-playing generates fictional artifacts, and token usage is spent on organizational theater rather than intelligence. ABL eliminates all of this.

---

## Core Concept

A phase-based autonomous build loop where the human writes specs and performs final audit. Everything in between is automatic. The loop is driven by a dumb shell runner (Makefile). The LLM engine is Gemini CLI, chosen for free tier availability.

---

## Mental Model

```
Specs → [make phase] → Verified output → Human audit → approve or refine specs → next phase
```

The human touches the system exactly twice per phase: spec input and audit output.

---

## Roles

**Builder** — reads the phase index, pulls the current phase spec from `specs/`, reads the codebase. Implements contracts exactly. If `failed_specs.md` or `health.log` exist, fixes those first. Never runs health checks, tests, or any shell commands beyond reading and writing code. When done, stops.

**Deterministic Health Step** — not an LLM. Project-defined shell checks (lint, typecheck, unit tests, etc.) run by the Makefile after every build. All output captured to `logs/health.log`. Fails fast, feeds errors directly to the Builder on next attempt. Inner loop retries up to 10 times before declaring STUCK.

**Verifier** — reads the phase index, pulls all cumulative specs from `specs/`, tests the live running system. Writes tests and runs them in a single session. Reports failures via `failed_specs.md`. Never reads source code. Never starts the dev server — it is already running. When done, stops immediately.

**Makefile** — runs the loop, manages git, starts/stops the dev server, enforces filesystem boundaries via firejail, tracks token usage, surfaces results to human. No intelligence. No interpretation.

There is no Rectifier. The Builder is the only entity that touches code.

---

## Information Boundaries

| Role | Reads | Never reads |
|---|---|---|
| Builder | specs/ (via index) + SRC_DIR codebase + health.log + failed_specs.md | TESTS_DIR, Makefile, abl.config.sh, prompts/verifier.md |
| Deterministic Step | Nothing — executes shell directly | N/A |
| Verifier | specs/ (via index) + TESTS_DIR + failed_specs.md | SRC_DIR, Makefile, abl.config.sh |
| Makefile | Exit codes + failed_specs.md presence | Everything else |

Boundaries are enforced by **firejail**. Each role runs in a sandboxed process whitelisted only to its permitted directories. `specs/` is whitelisted for both roles so they can pull phase context on demand. `--include-directories` tells Gemini CLI's internal path validator about the additional directories — both firejail and Gemini must agree on what's accessible.

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

**Pass/fail signal:** The presence of `failed_specs.md` containing at least one `SPEC:` entry means failure. Absence or empty file means pass. The Makefile reads this deterministically — no LLM exit code is trusted for pass/fail.

---

## Git Strategy

Two separate git repositories — one in SRC_DIR, one in TESTS_DIR. The firejail boundary extends into version control. Neither role can traverse the other's git history.

**Commit points in SRC_DIR/.git:**
```
phaseN/build/step-X/pre-deterministic    — raw Builder output
phaseN/build/step-X/post-deterministic   — after health checks passed
```

**Commit points in TESTS_DIR/.git:**
```
phaseN/verify/step-X/results            — after running suite
```

---

## File Structure

```
project/
├── [SRC_DIR]/                # configurable — default "src"
│   ├── .git/
│   └── [all application code]
├── [TESTS_DIR]/              # configurable — default "tests"
│   ├── .git/
│   └── failed_specs.md       # Written by Verifier on failure, deleted on pass
├── specs/
│   ├── index.md              # Auto-generated — one line per phase, appended on each run
│   ├── phase1.md
│   └── phaseN.md
├── logs/                     # Runtime artifacts — gitignore logs/* !logs/tokens.csv
│   ├── builder.log           # Full Gemini CLI JSON output from Builder (last run)
│   ├── verifier.log          # Full Gemini CLI JSON output from Verifier (last run)
│   ├── health.log            # Deterministic health check output (retained on fail)
│   ├── dev.log               # Dev server stdout/stderr
│   ├── dev.pid               # Dev server process ID
│   └── tokens.csv            # Cumulative token usage across all phases
├── project.md                # Human-written project description
├── project_map.txt           # Auto-generated before every LLM call
├── .env                      # Secrets — gitignored, never passed to LLMs
├── prompts/
│   ├── builder.md
│   └── verifier.md
├── abl.config.sh             # Project-specific shell hooks
└── Makefile                  # Universal ABL runner — never modified per project
```

---

## Phase Index

`specs/index.md` is auto-generated by the Makefile. Each time `make phase PHASE=N` runs, the first line of `specs/phaseN.md` is appended to `specs/index.md`. This gives both Builder and Verifier a lightweight lookup table of all phases without piping every spec file into context.

Example `specs/index.md`:
```
# Phase 1: Hello API
# Phase 2: Greeting Personalization
# Phase 3: Health Check
# Phase 4: Authentication
```

Both roles read this index to decide which spec files to pull. The Makefile never pipes spec files directly — roles pull on demand via firejail-whitelisted `specs/`.

**Rule:** The first line of every phase spec file must be a heading in the format `# Phase N: Title`.

To regenerate the index from existing phase files:
```bash
for f in specs/phase*.md; do head -1 "$f"; done > specs/index.md
```

---

## The Loop

```
make phase PHASE=N:
    - Initialize SRC_DIR/.git and TESTS_DIR/.git if not present
    - Initialize logs/tokens.csv with header if not present
    - Append phase N heading to specs/index.md
    - If health.log or failed_specs.md exist: resume mode
      → print what prior state was found
      → first build attempt uses _build_with_context

outer loop (max 5 Verifier iterations):

    inner loop (max 10 health attempts):
        Builder runs in firejail (SRC_DIR + specs/)
        Clean start: only on very first attempt with no prior state
        All other attempts: context includes failed_specs.md + health.log if present
        Builder writes code
        git commit SRC_DIR: "phaseN/build/step-X/pre-deterministic"

        Deterministic health check (abl.config.sh health_check)
        → FAIL: health.log retained, extract tokens, Builder retries
        → PASS: health.log cleared
                git commit SRC_DIR: "phaseN/build/step-X/post-deterministic"
                extract tokens, break inner loop

    inner loop exhausted (10 fails): STUCK (health) → surface logs/health.log

    Dev server starts fresh (abl.config.sh start_dev)
    State reset (abl.config.sh reset_state)

    Verifier runs in firejail (TESTS_DIR + specs/)
    Verifier reads index, pulls all cumulative specs, writes and runs tests
    extract tokens
    → failed_specs.md absent or empty: ✓ PASS — kill server, surface to human
    → failed_specs.md has SPEC entries: FAIL
      git commit TESTS_DIR: "phaseN/verify/step-X/results"
      kill server → next outer iteration

outer loop exhausted (5 Verifier fails): STUCK (contracts) → surface failed_specs.md
```

---

## Continuous Phases

`make phase PHASE=N` is idempotent and resumable. If a previous run left state behind:

- `logs/health.log` present → Builder last failed health check → resume with health context
- `TESTS_DIR/failed_specs.md` present → Verifier last failed contracts → resume with failure context
- Both absent → clean start

The loop always picks up from where it left off. Rerunning after a STUCK, a crash, or a quota exhaustion is safe and correct.

---

## Token Tracking

Every Gemini call appends a row to `logs/tokens.csv`:

```csv
timestamp,phase,step,role,model,input,candidates,cached,total
"2026-02-22 18:00:00","4","1","builder","gemini-2.5-flash",95171,4711,456101,564745
"2026-02-22 18:05:00","4","1","verifier","gemini-2.5-flash",12000,800,8000,21000
"2026-02-22 18:10:00","4","2","builder","unknown","ERROR",0,0,0,0
```

`ERROR` rows are written when the log is missing or malformed (quota exhaustion, crash, etc.) — the run is recorded even if tokens cannot be extracted.

View cumulative totals:
```bash
make costs
```

`tokens.csv` is the one log worth preserving in git. Recommended `.gitignore`:
```
logs/*
!logs/tokens.csv
```

---

## Makefile and Project Configuration

The Makefile is a **universal ABL runner** — it never changes between projects. All project-specific logic lives in `abl.config.sh`.

### abl.config.sh — per project

```bash
#!/bin/bash
COMMAND=${1}

case "$COMMAND" in

  src_dir)
    echo "src"       # change to match your project: "app", "backend", etc.
    ;;

  tests_dir)
    echo "tests"     # change to match your project: "e2e", "spec", etc.
    ;;

  start_dev)
    mkdir -p logs
    kill $(lsof -ti:3000) 2>/dev/null
    rm -f src/.next/dev/lock
    sleep 1
    cd src
    npm run dev > ../logs/dev.log 2>&1 &
    echo $! > ../logs/dev.pid
    cd ..
    sleep 5
    ;;

  stop_dev)
    kill -- -$(cat logs/dev.pid) 2>/dev/null
    pkill -f "next dev" 2>/dev/null
    kill $(lsof -ti:3000) 2>/dev/null
    rm -f src/.next/dev/lock
    ;;

  health_check)
    mkdir -p logs
    > logs/health.log

    cd src

    echo "=== LINT ===" >> ../logs/health.log
    npm run lint >> ../logs/health.log 2>&1
    lint_exit=$?

    echo "=== TYPECHECK ===" >> ../logs/health.log
    npx tsc --noEmit >> ../logs/health.log 2>&1
    tsc_exit=$?

    # echo "=== UNIT TESTS ===" >> ../logs/health.log
    # npm test -- --passWithNoTests >> ../logs/health.log 2>&1

    cd ..
    [ $lint_exit -eq 0 ] && [ $tsc_exit -eq 0 ]
    ;;

  reset_state)
    :   # npm run db:reset && npm run db:seed
    ;;

  map_deps)
    cat src/package.json
    ;;

esac
```

### Makefile — key design points

- `SRC_DIR` and `TESTS_DIR` read from `abl.config.sh` at parse time — Makefile is blind to actual paths
- `GEMINI_API_KEY` read from `.env` at parse time, injected via `env` into each Gemini call — firejail never touches `.env`
- `specs/index.md` auto-appended on each `make phase` run
- Both roles get `specs/` whitelisted in firejail + `--include-directories` for Gemini path validation
- Builder runs first — Verifier writes and runs tests in one session, no separate write-tests step
- `--no-print-directory` suppresses make recursion noise
- `--output-format json` on all Gemini calls — clean console, structured debug logs
- Token extraction after every Gemini call — defensive, handles missing/malformed JSON
- Health inner loop: 10 attempts before STUCK
- Verifier outer loop: 5 iterations before STUCK
- Resume logic: prior state detected at startup, first build uses context if state exists

Model selection:

```bash
make phase PHASE=1
make phase PHASE=2 BUILDER_MODEL=gemini-2.5-pro
make phase PHASE=3 VERIFIER_MODEL=gemini-2.5-pro
make costs
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

**Supersession** — when a later phase changes an existing contract:

```
SUPERSEDES: POST /auth/login → 200 {token}
POST /auth/login {valid email, valid password} → 200 {token, refresh_token}
```

**Stateful flow blocks:**

```
FLOW: registration-to-dashboard
  POST /auth/register {email, password} → 201 {user_id}
  POST /auth/login {email, password} → 200 {token}
  GET /dashboard (token) → 200
```

### Spec Rules

- First line must be `# Phase N: Title` — feeds the index
- Specs are append-only across phases — supersession is explicit via SUPERSEDES
- Never remove a spec — removal silently drops test coverage
- Stateful sequences go in FLOW blocks with explicit ordering
- Cumulative: the Verifier tests ALL phases every iteration, not just the current one

### What a Phase Is

A phase is a coherent functional grouping of specs that together describe a complete, auditable slice of behavior. A phase is too small if it cannot be demoed. A phase is too large if it contains more than one distinct functional concern. When in doubt, split.

---

## Environment and Security

**firejail** is the enforcement layer. Builder sees only SRC_DIR and specs/. Verifier sees only TESTS_DIR and specs/. No bash tricks escape the sandbox.

**`--include-directories`** tells Gemini CLI's internal workspace validator which paths are legitimate. Both firejail and Gemini must agree — whitelisting in firejail alone is insufficient.

**Dev server** starts fresh after every successful health check, killed after every Verifier run.

**Secrets** live in `.env` at project root, gitignored. The Makefile reads `GEMINI_API_KEY` from `.env` at parse time and passes it as an environment variable — never as a file path inside the sandbox.

**Git as undo** — every meaningful state is committed. Any unintended change is one `git checkout` away.

---

## Human Audit

The human audits the phase output as a complete experience. Problems are addressed by refining specs — never by patching code directly. All corrections become permanent spec knowledge.

---

## What This Is Not

- Not an agent framework
- Not multi-model
- Not a sprint team simulation
- Not dependent on paid API