# ABL — Autonomous Build Loop

A phase-based AI development framework. Write specs, run `abl phase N`, audit the output.

## How it works

```
Specs → [abl phase N] → Verified output → Human audit → next phase
```

The human touches the system exactly twice per phase: writing the spec and auditing the result. Everything in between — building, testing, retrying — is automatic.

ABL uses two isolated AI roles:

- **Builder** — reads specs, writes code, manages its own environment quality via `abl-cmd`. Runs in a Docker container with access only to your source directory.
- **Verifier** — reads specs, tests the live system adversarially, reports contract failures. Runs in a separate Docker container with access only to your tests directory.

Neither role can see the other's workspace.

## Requirements

- Node.js >= 18
- Docker (running)
- Gemini CLI (`npm install -g @google/generative-ai-cli`)
- A `GEMINI_API_KEY` in your project's `.env`

## Installation

```bash
npm install -g abl
```

## Quick Start

```bash
cd your-project
abl init
# Edit .abl/project.md and .abl/specs/phase1.md
abl phase 1
```

## Commands

```
abl init                    Initialize ABL in the current directory
abl phase <N>               Run phase N
abl phase <N> -b <model>    Override builder model
abl phase <N> -v <model>    Override verifier model
abl costs                   Show cumulative token usage
abl --help                  Show help
```

## Project Structure

After `abl init`:

```
your-project/
├── .abl/
│   ├── abl.config.yaml     # Project configuration — edit this
│   ├── project.md          # Project description — edit this
│   ├── specs/              # Your specs — write these
│   ├── tests/              # Verifier's workspace
│   ├── logs/
│   │   └── tokens.csv      # Cumulative token usage
│   ├── lean_settings.json  # Gemini CLI settings (auto-generated)
│   └── geminiignore.txt    # Gemini ignore rules (auto-generated)
├── src/                    # Your application source (Builder's workspace)
└── .env                    # GEMINI_API_KEY=your_key (gitignored)
```

## Configuration

`.abl/abl.config.yaml`:

```yaml
directories:
  src: ./src

models:
  builder: gemini-2.5-pro
  verifier: gemini-2.5-flash

builder_commands:
  health_check: npm run lint && npx tsc --noEmit
  start_dev: npm run dev

verifier_commands:
  seed: npm run db:seed

loop:
  max_verifier_iterations: 5
```

## Writing Specs

Specs are behavioral contracts. First line must be `# Phase N: Title`.

```markdown
# Phase 1: Authentication

Users must be able to register and log in. Sessions are JWT-based.
Passwords are hashed. Database is PostgreSQL.

### Contracts
POST /auth/register {email, password} → 201 {user_id}
POST /auth/register {existing email} → 409
POST /auth/login {valid credentials} → 200 {token}
POST /auth/login {invalid password} → 401
GET /dashboard (no token) → redirect /login
GET /dashboard (valid token) → 200
```

## How the Loop Works

```
abl phase N
  ↓
Builder:
  Builder writes code (Docker: src/ + specs/)
  Builder runs its own health checks (abl-cmd)
  Builder writes Run Report
  ↓
Verifier:
  Verifier resets environment (abl-cmd)
  Verifier tests all cumulative contracts adversarially
  Verifier writes failed_specs.md on failure
  Verifier writes Run Report
  ↓
Outer loop (max 5 Verifier iterations)
  → fail: commit, next outer iteration
  → pass: done ✓
  → exhausted: STUCK — see failed_specs.md
```

## Resume

`abl phase N` is idempotent. If a run was interrupted or got STUCK:

```bash
abl phase N   # automatically detects failed_specs.md and resumes
```

## Token Tracking

Every Gemini call is logged to `.abl/logs/tokens.csv`. View a summary:

```bash
abl costs
```

## Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Required. Put in `.env` at project root. |
| `ABL_DEBUG` | Set to any value to print stack traces on errors. |

## v1 Reference

The original Makefile-based v1 is archived in `v1/` for reference. It requires Linux + firejail and is not actively maintained.

## License

MIT
