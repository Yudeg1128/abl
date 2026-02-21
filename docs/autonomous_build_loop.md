# Autonomous Build Loop (ABL)
## Concept Formalization v0.5

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

**Builder** — reads all cumulative contracts + current codebase + deterministic error logs when applicable. Writes code only. Never sees Verifier tests, test results, or anything outside `src/`. Does not run lint, build, or any health commands — those are the Makefile's job. When done writing code, stops.

**Deterministic Code Health Step** — not an LLM. Fixed shell checks run by the Makefile after every build: lint, type check. Fails fast, feeds raw error output directly to the Builder, blocks progression to the Verifier until all pass cleanly. Defined in `abl.config.sh`.

**Verifier** — reads all cumulative specs, never sees code. Writes an initial test suite once at phase start. Runs and refines the suite each iteration — expanding, refocusing, or correcting tests as needed — but always anchored to contracts. Never rewrites the suite from scratch mid-loop. Communicates failures via `failed_specs.md` only. The dev server is already running on localhost:3000 — the Verifier never starts it.

**Makefile** — runs the loop, manages git, starts/stops the dev server, enforces filesystem boundaries via firejail, surfaces result to human. No intelligence. No interpretation.

There is no Rectifier. The Builder is the only entity that touches code.

---

## Information Boundaries

| Role | Reads | Never reads |
|---|---|---|
| Builder | All cumulative contracts + src/ codebase + deterministic error logs + failed_specs.md | tests/, specs/, prompts/verifier.md, Makefile, abl.config.sh |
| Deterministic Step | Nothing — executes code directly | N/A |
| Verifier | All cumulative specs + failed_specs.md + tests/ | src/, Makefile, abl.config.sh |
| Makefile | Exit codes + failed_specs.md presence | Everything else |

Boundaries are enforced by **firejail** — each role runs in a sandboxed process that can only see its permitted directory. Even bash tricks like `cat ../Makefile` return nothing because the file literally does not exist in the sandbox. Prompts are a secondary soft layer, not the enforcement mechanism.

---

## Communication Channel: Builder ↔ Verifier

The Verifier passes failures to the Builder via `tests/failed_specs.md`. Each entry contains the failed contract, the exact input used, and the observed system behavior. Written entirely in spec language — no test code, no test output, no implementation details.

Format:

```
SPEC: POST /auth/login {valid credentials} → 200 {token}
INPUT: {"email": "test@test.com", "password": "correct"}
OBSERVED: 404

SPEC: GET /dashboard (valid token) → 200
INPUT: GET /dashboard headers: {Authorization: Bearer <token>}
OBSERVED: redirect /login
```

INPUT is mandatory — the Builder must know exactly what stimulus triggered the failure. Without INPUT, OBSERVED is ambiguous. Failure classification is intentionally omitted — SPEC + INPUT + OBSERVED is sufficient for a capable LLM to triage and act.

**Pass/fail signal:** The presence of `failed_specs.md` containing at least one `SPEC:` entry means failure. Absence or empty file means pass. The Makefile reads this deterministically — no LLM exit code is trusted for pass/fail.

---

## Git Strategy

Two separate git repositories — one for src, one for tests. The firejail boundary extends into version control. Neither role can traverse the other's git history.

```
project/
├── src/
│   ├── .git/          # Builder's repo — code only
│   └── [code files]
├── tests/
│   ├── .git/          # Verifier's repo — tests only
│   └── [test files]
```

Each repo has its own linear commit history. No shared `.git`, no branch switching, no cross-contamination.

**Commit points in src/.git:**
```
phaseN/build/step-X/pre-deterministic    — raw Builder output
phaseN/build/step-X/post-deterministic   — after health checks passed
```

**Commit points in tests/.git:**
```
phaseN/verify/suite-written              — initial test suite written
phaseN/verify/step-X/results            — after running suite
```

---

## File Structure

```
project/
├── src/
│   ├── .git/
│   └── [all application code]
├── tests/
│   ├── .git/
│   ├── failed_specs.md       # Written by Verifier on failure, read by Builder
│   └── results/              # logs: dev.log, dev.pid, lint.log
├── specs/
│   ├── phase1.md
│   └── phaseN.md
├── project.md                # Human-written project description
├── prompts/
│   ├── builder.md
│   └── verifier.md
├── abl.config.sh             # Project-specific shell hooks
└── Makefile                  # Universal ABL runner — never modified per project
```

---

## The Loop

```
ONCE at phase start:
    _map_src → project_map.txt (src tree only)
    Verifier writes initial test suite in firejail (tests/ only)
    git commit tests: "phaseN/verify/suite-written"

loop (max 3 iterations):
    1. _map_src → project_map.txt
       Builder runs in firejail (src/ only)
       Builder reads specs + project_map.txt + failed_specs.md (if any)
       Builder writes code
       git commit src: "phaseN/build/step-X/pre-deterministic"

    2. Deterministic health check (lint + typecheck)
       → FAIL: raw logs fed to Builder → back to step 1
       → PASS: git commit src: "phaseN/build/step-X/post-deterministic"

    3. Dev server starts fresh (abl.config.sh start_dev)
       State reset (abl.config.sh reset_state)
       Verifier runs in firejail (tests/ only)
       Verifier hits live server on localhost:3000
       → tests/failed_specs.md absent or empty: ✓ PASS — kill server, surface to human
       → tests/failed_specs.md has SPEC entries: FAIL
         git commit tests: "phaseN/verify/step-X/results"
         kill server
         → back to step 1

    4. After 3 iterations: STUCK
       Surface to human: failed_specs.md + lint.log
```

---

## Makefile and Project Configuration

The Makefile is a **universal ABL runner** — it never changes between projects. All project-specific shell logic lives in `abl.config.sh`. Written once, reused across every project.

### abl.config.sh — per project

```bash
#!/bin/bash
# Project-specific configuration for ABL.
# Edit this file per project. Never edit the Makefile.

COMMAND=${1}

case "$COMMAND" in

  start_dev)
    mkdir -p tests/results
    cd src
    npm run dev > ../tests/results/dev.log 2>&1 &
    echo $! > ../tests/results/dev.pid
    cd ..
    sleep 5
    ;;

  health_check)
    cd src
    npm run lint > ../tests/results/lint.log 2>&1
    lint_exit=$?
    npx tsc --noEmit >> ../tests/results/lint.log 2>&1
    tsc_exit=$?
    cd ..
    [ $lint_exit -eq 0 ] && [ $tsc_exit -eq 0 ]
    ;;

  reset_state)
    # stateless — no-op
    :
    ;;

  map_deps)
    cat src/package.json
    ;;

esac
```

### Makefile — universal

```makefile
PHASE          ?= 1
BUILDER_MODEL  ?= gemini-2.5-pro
VERIFIER_MODEL ?= gemini-2.5-flash
SPECS          := $(wildcard specs/phase*.md)

# ── Helpers ────────────────────────────────────────────────────────────────

_map:
	tree src/ -I 'node_modules|.git' --dirsfirst > project_map.txt
	echo "---" >> project_map.txt
	bash abl.config.sh map_deps >> project_map.txt

# ── Roles ──────────────────────────────────────────────────────────────────

_write_tests:
	$(MAKE) _map
	cat prompts/verifier.md project.md project_map.txt $(SPECS) \
	| firejail --whitelist=$(PWD)/tests \
	  gemini -m $(VERIFIER_MODEL) -y -p "Write the initial test suite for this phase."
	cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/suite-written"; }

_build:
	$(MAKE) _map
	cat prompts/builder.md project.md project_map.txt specs/phase$(PHASE).md \
	| firejail --whitelist=$(PWD)/src \
	  gemini -m $(BUILDER_MODEL) -y -p "Execute your build instructions."
	cd src && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic"; }

_build_with_failures:
	$(MAKE) _map
	cat prompts/builder.md project.md project_map.txt specs/phase$(PHASE).md tests/failed_specs.md \
	| firejail --whitelist=$(PWD)/src \
	  gemini -m $(BUILDER_MODEL) -y -p "Execute your build instructions."
	cd src && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$(STEP)/pre-deterministic"; }

_verify_clean:
	$(MAKE) _map
	cat prompts/verifier.md project.md project_map.txt $(SPECS) \
	| firejail --whitelist=$(PWD)/tests \
	  gemini -m $(VERIFIER_MODEL) -y -p "Run the test suite. Write failed_specs.md on failure."
	cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/step-$(STEP)/results"; }

_verify:
	$(MAKE) _map
	cat prompts/verifier.md project.md project_map.txt $(SPECS) tests/failed_specs.md \
	| firejail --whitelist=$(PWD)/tests \
	  gemini -m $(VERIFIER_MODEL) -y -p "Run the test suite. Write failed_specs.md on failure."
	cd tests && git add -A && { git diff --cached --quiet || git commit -m "phase$(PHASE)/verify/step-$(STEP)/results"; }

# ── Main loop ──────────────────────────────────────────────────────────────

phase:
	[ -d src/.git ]   || git -C src init
	[ -d tests/.git ] || git -C tests init
	mkdir -p tests/results
	$(MAKE) _write_tests
	@for i in 1 2 3; do \
		echo "--- Iteration $$i ---"; \
		if [ $$i -eq 1 ]; then \
			$(MAKE) _build STEP=$$i || exit 1; \
		else \
			$(MAKE) _build_with_failures STEP=$$i || exit 1; \
		fi; \
		bash abl.config.sh health_check || { \
			echo "✗ Code health failed — see tests/results/lint.log"; \
			continue; }; \
		cd src && git add -A && \
			{ git diff --cached --quiet || git commit -m "phase$(PHASE)/build/step-$$i/post-deterministic"; } && cd ..; \
		bash abl.config.sh start_dev; \
		bash abl.config.sh reset_state; \
		if [ $$i -eq 1 ]; then \
			$(MAKE) _verify_clean STEP=$$i; \
		else \
			$(MAKE) _verify STEP=$$i; \
		fi; \
		kill $$(cat tests/results/dev.pid) 2>/dev/null; \
		if [ ! -f tests/failed_specs.md ] || ! grep -q "SPEC:" tests/failed_specs.md; then \
			echo "✓ Phase $(PHASE) passed"; \
			exit 0; \
		fi; \
	done; \
	echo "✗ STUCK — see tests/failed_specs.md"; exit 1
```

Model selection is per invocation:

```bash
make phase PHASE=1                                                        # use defaults
make phase PHASE=2 BUILDER_MODEL=gemini-2.0-flash                        # swap builder model
make phase PHASE=3 VERIFIER_MODEL=gemini-2.5-pro                         # swap verifier model
```

---

## Spec and Phase Requirements

### What a Spec Is

A spec is a behavioral contract. It defines a specific action and a specific expected result with no room for interpretation. The Verifier must be able to derive a test from it without any implementation knowledge. If a spec can be satisfied by two different behaviors, it is not tight enough.

### Spec Format

Each spec is written in two parts: natural language context and quasi-code contracts.

**Context** — explains intent, architectural decisions, technology constraints, and security considerations. Written in natural language. Gives Builder and Verifier the intelligence to act coherently beyond the literal contracts.

**Contracts** — define exact behavioral expectations in quasi-code. One action, one result, no ambiguity.

```
ACTION → EXPECTED RESULT
```

**Supersession** — when a later phase changes an existing contract, it must explicitly declare it:

```
SUPERSEDES: POST /auth/login → 200 {token}
POST /auth/login {valid email, valid password} → 200 {token, refresh_token}
```

**Stateful flow blocks** — for sequences where order matters, group contracts explicitly:

```
FLOW: registration-to-dashboard
  POST /auth/register {email, password} → 201 {user_id}
  POST /auth/login {email, password} → 200 {token}
  GET /dashboard (token) → 200
```

The Verifier runs flow blocks in declared order. State from one step carries into the next.

### Example Phase Spec

```markdown
## Phase 1: Authentication

Users must be able to register and log in securely. Sessions
are JWT-based. Passwords are hashed. Database is PostgreSQL.
Failed attempts must not reveal whether an email exists.

### Contracts
POST /auth/register {email, password} → 201 {user_id}
POST /auth/register {existing email} → 409
POST /auth/login {valid email, valid password} → 200 {token}
POST /auth/login {invalid password} → 401
POST /auth/login {nonexistent email} → 401
GET /dashboard (no token) → redirect /login
GET /dashboard (valid token) → 200

### Flows
FLOW: registration-to-dashboard
  POST /auth/register {email, password} → 201
  POST /auth/login {email, password} → 200 {token}
  GET /dashboard (token) → 200
```

### What a Phase Is

A phase is a coherent functional grouping of specs that together describe a complete, auditable slice of behavior. The human audit should be able to experience a phase as a meaningful, demonstrable unit.

A phase is too small if it cannot be demoed as a complete thing. A phase is too large if it contains more than one distinct functional concern. When in doubt, split.

### Spec Rules

- Quasi-code is the contract layer — precise, unambiguous, directly testable
- Natural language is the context layer — intent, constraints, architecture
- Both are required. Neither is sufficient alone.
- Specs are append-only across phases. Supersession is explicit via SUPERSEDES keyword
- Removing a spec removes test coverage permanently. Never remove, only supersede
- Stateful sequences must be declared as FLOW blocks with explicit ordering

---

## Context Requirements

### Builder Context (injected via pipe, then firejail to src/)

```
prompts/builder.md          # system prompt
project.md                  # project description
project_map.txt             # src/ tree only + package deps
specs/phase*.md             # ALL cumulative specs
tests/failed_specs.md       # if any failures from last iteration
```

### Verifier Context (injected via pipe, then firejail to tests/)

```
prompts/verifier.md         # system prompt
project.md                  # project description
project_map.txt             # src/ tree (topology only — no source reading)
specs/phase*.md             # ALL cumulative specs
tests/failed_specs.md       # if any failures from last iteration
```

### project.md

Human-written once at project start. Describes what the project is, who it's for, technology stack, and high-level architectural decisions. Never auto-generated.

### project_map.txt

Auto-generated before every LLM call. Scoped to `src/` only — the full project root tree is never exposed to either role.

```makefile
_map:
	tree src/ -I 'node_modules|.git' --dirsfirst > project_map.txt
	echo "---" >> project_map.txt
	bash abl.config.sh map_deps >> project_map.txt
```

---

## Environment and Security

**firejail** is the enforcement layer. Each role runs in a sandboxed process whitelisted to its permitted directory only. `cat ../Makefile` from inside the sandbox returns nothing — the file does not exist in the sandbox. No bash tricks can escape it.

**Dev server** starts fresh after every successful health check, before the Verifier runs. Killed after every Verifier run. Never running during build or health check steps. This prevents the `.next` cache permission issues that arise from locking `src/` while the server is running.

**Secrets** live in `.env` at project root, listed in `.gitignore`. Never passed into LLM context. Always use sandbox credentials during the loop — never production keys.

**Git as undo** — every meaningful state is committed to the appropriate repo. Any unintended change is one `git checkout` away from reversal.

---

## Human Audit

The human audits the phase output as a complete experience. If problems are found, they are addressed by refining or extending specs — never by patching code directly. Refined specs either amend the current phase or define a new phase, then the loop reruns. All corrections become permanent spec knowledge.

---

## What This Is Not

- Not an agent framework
- Not multi-model
- Not a sprint team simulation
- Not dependent on paid API