# Phase 1: Workspace & Task Initialization

## Context
Implement the core workspace creation and initial task injection. Each workspace must automatically generate a `UUID` and a `system_log` entry.

## Contracts

### POST /api/workspaces
**Input:** `{"name": "Engineering Team"}`
**Success:** `201 {"id": "uuid", "name": "Engineering Team", "status": "active"}`
**Fail (Invalid Name):** `422 {"detail": [...]}`

### VERIFICATION: Physical Table State
**Action:** After successful `POST /api/workspaces`
**Query:** `SELECT name, status FROM workspaces WHERE id = '<ID_FROM_RESPONSE>'`
**Expected:** `Engineering Team|active`

### VERIFICATION: System Audit
**Action:** After successful `POST /api/workspaces`
**Query:** `SELECT COUNT(*) FROM system_logs WHERE workspace_id = '<ID_FROM_RESPONSE>' AND action = 'INITIALIZE'`
**Expected:** `1`

### POST /api/tasks
**Input:** `{"workspace_id": "uuid", "title": "Setup CI"}`
**Success:** `201 {"id": "uuid", "secret_token": "random_string"}`
**Fail (Missing Workspace):** `404 {"error": "WORKSPACE_NOT_FOUND"}`