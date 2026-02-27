# Phase 1: User Onboarding & Wallet Initialization

## Context
Implement the foundational user creation flow. When a user is created, a default `USD` wallet must be initialized in the `wallets` table.

## Contracts

### POST /api/users
**Input:** `{"email": "user@example.com", "name": "Test User"}`
**Success:** `201 {"id": "uuid", "email": "user@example.com"}`
**Fail (Duplicate):** `409 {"error": "USER_EXISTS"}`
**Fail (Invalid Email):** `400 {"error": "INVALID_INPUT"}`

### VERIFICATION: Wallet Initialization (Anti-Fabrication)
**Action:** After successful `POST /api/users`
**Query:** `SELECT currency, balance FROM wallets WHERE user_id = '<ID_FROM_PREVIOUS_STEP>'`
**Expected:** `USD|0.00`

### VERIFICATION: Audit Trail
**Action:** After successful `POST /api/users`
**Query:** `SELECT event_type FROM audit_events WHERE user_id = '<ID_FROM_PREVIOUS_STEP>'`
**Expected:** `USER_CREATED`