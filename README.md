# ABL — Autonomous Build Loop

ABL is a phase-based autonomous development framework. It orchestrates two isolated AI roles—a **Builder** and a **Verifier**—to implement software iteratively based on strict behavioral contracts.

## How it Works

1.  **Human Writes Specs**: You define a phase as a list of behavioral "contracts" (Action → Result).
2.  **Builder Implements**: The Builder reads the spec and writes the code.
3.  **Verifier Tests**: The Verifier attempts to break the implementation by testing it against the contracts.
4.  **Looping**: If the Verifier finds a failure, it writes a `failed_specs.md` file. The Builder receives this file and tries again.
5.  **Audit**: Once all contracts pass, the loop finishes, and you audit the result.

## Prerequisites

-   **Node.js**: >= 18.0.0
-   **Gemini CLI**: `npm install -g @google/generative-ai-cli`
-   **API Key**: A valid `GEMINI_API_KEY` in your project's `.env` file.
-   **Git**: Required for the internal state tracking and versioning.

## Installation

```bash
npm install -g abl
```

## Quick Start

1.  **Initialize**:
    ```bash
    mkdir my-project && cd my-project
    abl init
    ```
2.  **Define Project**: Edit `.abl/project.md` to describe the tech stack and goals.
3.  **Write Phase 1**: Edit `.abl/specs/phase1.md` with your first contracts.
4.  **Run**:
    ```bash
    abl run
    ```

---

## Writing High-Quality Specs

Specs are behavioral contracts. They must be **non-interpretable**. If a human tester wouldn't know exactly what to do, the AI won't either.

### The Contract Format
A contract consists of a stimulus and an expected response.

**Bad Spec (Vague):**
> "The login page should work and show an error if the password is wrong."

**Good Spec (Contract):**
> `POST /api/login {"email": "user@test.com", "pass": "wrong"} → 401 Unauthorized`

### Spec Rules
1.  **Actionable**: Every contract must be testable via a command or script.
2.  **Atomic**: One action, one result.
3.  **Cumulative**: The Verifier tests all previous phases in every run to prevent regressions.

---

## Configuration (`abl.config.yaml`)

This file defines the workspace and how the agents interact with your environment.

```yaml
directories:
  src: ./src        # Where the Builder works
  tests: ./tests    # Where the Verifier works

models:
  builder: gemini-2.0-pro
  verifier: gemini-2.0-flash

builder_commands:
  health_check: 
    command: "npm run lint && npx tsc --noEmit"
    description: "Check for lint and type errors"

verifier_commands:
  seed: 
    command: "npm run db:seed"
    description: "Reset and seed the database"
  start_dev: 
    command: "npm run dev &"
    description: "Start the server in background"
  stop_dev:
    command: "pkill -f next-server"
    description: "Kill the dev server"
```

### `abl-cmd`
Agents do not see your raw shell commands. They see the names (e.g., `health_check`) and descriptions. They execute them using `abl-cmd <name>`.

---

## Command Reference

-   **`abl init`**: Sets up the `.abl` directory, role prompts, and initializes git in your `src` and `tests` folders.
-   **`abl run`**: Resumes the current phase or starts the next pending phase.
-   **`abl phase <N>`**: Forces the execution of a specific phase.
-   **`abl costs`**: Summarizes token usage and costs from `.abl/logs/tokens.csv`.

---

## Recommended Practices

### What to use ABL for:
-   **API Backends**: Perfectly suited for request/response contracts.
-   **CLI Tools**: Easy to define input/output expectations.
-   **Logic Modules**: Great for data processing or complex algorithms.

### What NOT to use ABL for:
-   **UI Polish**: "Make the button look nice" is not a contract.
-   **Exploratory Coding**: If you don't know the architecture yet, ABL will struggle.
-   **Large Refactors**: ABL is phase-based; large architectural shifts should be defined in a new phase's context.

### Tips for Success:
-   **Use Health Checks**: Always provide the Builder with a `health_check` command (linting/typechecking).
-   **Isolated Iterations**: The Verifier should always run a `seed` or `reset` command before testing to ensure a clean state.
-   **Granular Phases**: Keep phases small (5-10 contracts). Large phases increase the chance of the Builder getting stuck in a "fix one, break another" loop.

## Project Structure

```text
.
├── .abl/
│   ├── abl.config.yaml   # Configuration
│   ├── project.md        # High-level project context
│   ├── state.json        # Current progress tracking
│   ├── specs/            # Phase definitions (phase1.md, etc)
│   ├── prompts/          # System prompts for roles (do not edit unless advanced)
│   └── logs/             # Role logs and token usage
├── src/                  # Builder's workspace (App code)
├── tests/                # Verifier's workspace (Test scripts/logs)
└── .env                  # GEMINI_API_KEY
```