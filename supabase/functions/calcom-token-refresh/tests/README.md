# Cal.com token refresh tests

This folder contains test scaffolding for the Cal.com token refresh flow.

Suggested runner:
- `deno test -A supabase/functions/calcom-token-refresh/tests`

Notes:
- Tests are currently marked as ignored until the fixtures/mocks are wired.
- The refresh logic lives in `supabase/functions/calcom-token-refresh/index.ts`.
