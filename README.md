# ABL — Autonomous Build Loop

ABL is an advanced, phase-based AI development framework. It orchestrates two strictly isolated AI agents—a **Builder** and a **Verifier**—to implement software iteratively based on ruthless behavioral contracts. 

ABL is not a toy coding assistant. It is a rigid, discipline-enforcing state machine designed to build real software.

## Why ABL?

1. **Semi-Production Grade by Default:** ABL produces reproducible, version-controlled, fully debuggable, and documented software. The framework assumes zero trust. The Builder writes the code; the Verifier attempts to break it via black-box testing. The loop only advances when the code mathematically passes the specs.
2. **Enforced Spec Discipline:** ABL cures "vague prompt" syndrome. It demands professional, non-interpretable product specs (Contracts). If your idea is un-testable, ABL will not build it. This extreme discipline prevents wasted time, token churn, and spaghetti code. 
3. **Extreme Token Efficiency:** ABL's architecture is so token-efficient that you can build complex, production-grade applications entirely on **Free Tier** LLM APIs. No other framework allows this level of autonomous loops without massive API bills.
4. **Lightweight & Agnostic:** ABL is purely an orchestration layer. It is unopinionated about your tech stack, cross-platform, free to use (MIT), and easily extensible. You bring the stack; ABL brings the discipline.

## How it Works

1. **Spec:** You define a phase as a list of strict contracts (`ACTION -> EXPECTED RESULT`).
2. **Build:** The Builder reads the spec and modifies the `src/` directory.
3. **Verify:** The Verifier reads the spec, spins up your app, and ruthlessly attacks it from the `tests/` directory.
4. **Loop:** Failures are passed back to the Builder. The loop repeats until all contracts pass. 
5. **Audit:** You perform a human audit, sign off, and write the next phase.

## Getting Started: The AI Copilot Method

**Do not attempt to set up ABL manually.** ABL requires syntactically perfect bash pipelines and mathematically strict Markdown contracts. 

To start your project, use a frontier LLM (e.g., ChatGPT-5.2, Claude 4.6 Sonnet, or Gemini 3.1 Pro as of Feb 2026) as your Project Manager:

1. Open the `LLM_GUIDE.md` file in this repository.
2. Copy its **entire contents**.
3. Paste it into your favorite conversational AI.
4. Follow the AI's exact instructions. It will guide you through installation, configuration, spec engineering, and human auditing.

## License

MIT License. Free to use, modify, and distribute.

⚠️ **DISCLAIMER: USE AT YOUR OWN RISK**
ABL is an autonomous system that executes AI-generated code and shell commands directly on your machine. **Always** run ABL inside a version-controlled repository (Git) and ensure your working directory is clean and committed before starting a phase. The maintainers are not responsible for any data loss, corrupted files, or unexpected system mutations caused by the AI agents.