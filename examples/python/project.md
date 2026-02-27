# Project: TaskFlow API
A high-performance task management backend built with Python 3.12, FastAPI, and SQLModel.

## Architecture
- **Framework:** FastAPI
- **Database:** PostgreSQL (via SQLModel/SQLAlchemy)
- **Environment:** Managed via `pip` and `requirements.txt`
- **Validation:** Pydantic v2
- **Testing:** Pytest for the Verifier scripts

## Core Goal
Provide a stateless REST API for managing distributed team tasks. Every task must be associated with a `workspace_id` and include a cryptographically random `secret_token` generated upon creation for external webhook validation.