-- Calcom Token Refresh - Minimal Deploy Diff (revA0)
-- Target: supabase/functions/calcom-token-refresh/index.ts
-- Date: 2026-02-27
-- Note: This is a textual diff packaged as a .sql file per request.

-- === BEGIN DIFF ===
-- 1) Add idempotency lock + helper to prevent concurrent refresh
-- + const refreshLocks = new Map<string, Promise<Response>>();
-- + const withRefreshLock = async (key: string, fn: () => Promise<Response>) => { ... };

-- 2) Validate credentials before refresh (fix: avoid null client_id/client_secret)
-- + if (!cred.client_id || !cred.client_secret) {
-- +   throw new Error("Credencial Cal.com incompleta");
-- + }

-- 3) Normalize error handling for unknown error types
-- + const message = error instanceof Error ? error.message : "Unknown error";
-- + response_payload: { message }
-- + return new Response(JSON.stringify({ success: false, message }), ...)

-- 4) Wrap refresh flow with lock (idempotency)
-- + return await withRefreshLock(credentialId, async () => { ...refresh logic... });

-- 5) Export helper (optional, no behavior change in production)
-- + export { handler, needsRefresh };
-- (If you want *only* production behavior, export can be omitted.)
-- === END DIFF ===
