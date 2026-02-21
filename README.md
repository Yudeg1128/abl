# ABL — Autonomous Build Loop

A minimal, free-tier LLM development framework. You write specs. A Builder LLM writes code. A Verifier LLM tests it. A Makefile runs the loop. You audit the result.

No paid API. No agent framework. No orchestration overhead. Just a Makefile, two prompts, and a shell config file.

```
Specs → [make phase] → Verified output → Human audit → next phase
```

---

## How it works

Each phase of your project is defined by a spec file. The loop runs automatically:

1. **Verifier** writes a test suite from your spec
2. **Builder** implements the code
3. Deterministic health checks run (lint, typecheck)
4. **Verifier** hits the live server and checks every contract
5. If anything fails, `failed_specs.md` is written and the Builder tries again
6. After 3 iterations without passing → STUCK, surface to human
7. On pass → human audits the running system

The human touches the system exactly twice per phase: spec input and audit output.

---

## Requirements

- [Gemini CLI](https://github.com/google-gemini/gemini-cli) — free tier works
- [firejail](https://firejail.wordpress.com/) — sandbox enforcement (`sudo apt install firejail`)
- `make`, `tree`, `curl`, `git`

---

## Setup

### 1. Clone this repo

```bash
git clone https://github.com/yourusername/abl.git
cd abl
```

### 2. Create your project structure

```bash
mkdir -p myproject/src myproject/tests myproject/specs
cd myproject
```

### 3. Copy the framework files

```bash
cp ../Makefile .
cp -r ../prompts .
cp ../abl.config.sh .
```

### 4. Configure for your project

Edit `abl.config.sh` — this is the only file you touch per project:

```bash
start_dev()     # how to start your dev server
health_check()  # lint + typecheck commands  
reset_state()   # DB seed, cache clear (no-op if stateless)
map_deps()      # cat your package.json / requirements.txt
```

### 5. Initialize your application

Put your app inside `src/`. For example, a Next.js project:

```bash
cd src && npx create-next-app@latest . && cd ..
```

### 6. Write your first spec

Create `specs/phase1.md`:

```markdown
## Phase 1: Hello API

A single API route that returns a JSON greeting.

### Contracts
GET /api/hello → 200 {message: "hello world"}
GET /api/nonexistent → 404
```

### 7. Run

```bash
make phase PHASE=1
```

---

## Spec format

Specs are behavioral contracts in two parts:

**Context** — natural language intent, architecture decisions, constraints.

**Contracts** — exact quasi-code action → result pairs. No ambiguity.

```markdown
## Phase 2: Auth

Users register and log in. JWT sessions. Passwords hashed.
Failed attempts must not reveal whether an email exists.

### Contracts
POST /auth/register {email, password} → 201 {user_id}
POST /auth/register {existing email} → 409
POST /auth/login {valid credentials} → 200 {token}
POST /auth/login {invalid password} → 401
GET /dashboard (no token) → redirect /login

### Flows
FLOW: register-then-login
  POST /auth/register {email, password} → 201
  POST /auth/login {email, password} → 200 {token}
```

**Rules:**
- Specs are append-only. Never delete, only supersede.
- To change a contract in a later phase: `SUPERSEDES: GET /api/hello → 200`
- Stateful sequences go in `FLOW` blocks — Verifier runs them in order

---

## Model selection

```bash
make phase PHASE=1                                          # defaults
make phase PHASE=1 BUILDER_MODEL=gemini-2.5-pro            # swap builder
make phase PHASE=1 VERIFIER_MODEL=gemini-2.5-pro           # swap verifier
make phase PHASE=1 BUILDER_MODEL=gemini-2.5-pro VERIFIER_MODEL=gemini-2.5-pro
```

Defaults are set at the top of the Makefile. Change them once there if you want persistent defaults.

---

## Project structure

```
myproject/
├── src/                  # your application — Builder's territory
│   └── .git/             # Builder's git repo
├── tests/                # test scripts — Verifier's territory
│   └── .git/             # Verifier's git repo
├── specs/
│   ├── phase1.md
│   └── phase2.md
├── prompts/
│   ├── builder.md        # Builder system prompt
│   └── verifier.md       # Verifier system prompt
├── project.md            # one-time project description
├── abl.config.sh         # your project-specific config
└── Makefile              # universal runner — never edited
```

---

## Security model

**firejail** enforces hard boundaries — not prompts, not chmod. The Builder runs in a sandbox that can only see `src/`. The Verifier runs in a sandbox that can only see `tests/`. Even bash tricks like `cat ../Makefile` return nothing. The file literally does not exist in the sandbox.

Secrets live in `.env` at project root, gitignored, never passed to LLMs.

Git is the undo button — every build and verify step is committed to its respective repo.

---

## When things go wrong

**STUCK** — after 3 iterations without passing, the loop surfaces `tests/failed_specs.md` to you. Read it. Either the spec is ambiguous (refine it) or the problem is architectural (new phase).

**Rate limits** — Gemini free tier has quota limits. If you hit them, wait and retry. Use `gemini-2.5-flash` for both roles to conserve quota.

**Stale server** — if `make phase` fails mid-run, clean up with:
```bash
pkill -f "next dev"
rm -f src/.next/dev/lock tests/failed_specs.md
chmod -R 755 src/ tests/
```

---

## Examples

See `examples/` for project-specific `abl.config.sh` templates:
- `examples/nextjs/` — Next.js + TypeScript
- more coming

---

## Contributing

This is early. The architecture is stable but the rough edges are real — quota handling, complex stateful resets, large codebase navigation. If you use it and find something broken, open an issue or PR. The governing design doc is in `docs/autonomous_build_loop.md`.

---

## License

MIT