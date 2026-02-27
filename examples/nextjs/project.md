# Project: SaaS Ledger Core
A high-integrity financial ledger built with Next.js 15 (App Router), Tailwind CSS, Drizzle ORM, and PostgreSQL.

## Architecture
- **Framework:** Next.js (TypeScript)
- **Database:** PostgreSQL (Neon/Local) via Drizzle ORM
- **Authentication:** Next-Auth (Auth.js)
- **Validation:** Zod for all API boundaries

## Core Goal
To provide a verifiable, double-entry bookkeeping system for a SaaS platform. All financial transitions must be recorded in the `ledger_entries` table before any balance is updated.