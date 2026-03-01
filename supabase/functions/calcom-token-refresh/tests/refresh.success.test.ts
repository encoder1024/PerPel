import { handler } from "../index.ts";
import { buildMockSupabase, clearMockCreateClient, setMockCreateClient } from "./_mock.ts";

Deno.test({
  name: "calcom-token-refresh: refresh succeeds and updates tokens",
  fn: async () => {
    const { createClient, state } = buildMockSupabase();
    setMockCreateClient(createClient);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          access_token: "access-123",
          refresh_token: "refresh-123",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    Deno.env.set("SUPABASE_URL", "http://localhost");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");

    const res = await handler(
      new Request("http://localhost", {
        method: "POST",
        headers: { Authorization: "Bearer service-key" },
        body: JSON.stringify({ credentialId: "cred-1", accountId: "acc-1" }),
      }),
    );

    const body = await res.json();

    globalThis.fetch = originalFetch;
    clearMockCreateClient();

    if (!body.success) throw new Error(`Expected success true, got: ${JSON.stringify(body)}`);
    if (state.updateCalls !== 1) throw new Error("Expected one update call");
    if (!state.lastUpdate) throw new Error("Missing update payload");
    if (state.insertCalls < 1) throw new Error("Expected log insert");
  },
});
