-- Migration 006: session revocation support
--
-- Adds a revoked_at timestamp to sessions so that individual sessions (or all
-- sessions for a user) can be invalidated before they naturally expire.
-- A non-NULL value means the session is revoked and must be rejected by the API.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Partial index: only unrevoked sessions need fast lookup by token_hash.
-- The authenticate() query filters on revoked_at IS NULL, so this index is used.
CREATE INDEX IF NOT EXISTS sessions_active_idx
  ON sessions (token_hash)
  WHERE revoked_at IS NULL;
