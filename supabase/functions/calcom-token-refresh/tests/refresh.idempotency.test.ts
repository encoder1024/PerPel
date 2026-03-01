import { handler } from "../index.ts";
import { buildMockSupabase, clearMockCreateClient, setMockCreateClient } from "./_mock.ts";

Deno.test({
  name: "calcom-token-refresh: idempotent refresh on concurrent calls",
  fn: async () => {
    const { createClient, state } = buildMockSupabase();
    setMockCreateClient(createClient);

    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          access_token: "access-123",
          refresh_token: "refresh-123",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    Deno.env.set("SUPABASE_URL", "http://localhost");
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key");

    const req1 = new Request("http://localhost", {
      method: "POST",
      headers: { Authorization: "Bearer service-key" },
      body: JSON.stringify({ credentialId: "cred-1", accountId: "acc-1" }),
    });
    const req2 = new Request("http://localhost", {
      method: "POST",
      headers: { Authorization: "Bearer service-key" },
      body: JSON.stringify({ credentialId: "cred-1", accountId: "acc-1" }),
    });

    const [res1, res2] = await Promise.all([handler(req1), handler(req2)]);
    const body1 = await res1.json();
    const body2 = await res2.json();

    globalThis.fetch = originalFetch;
    clearMockCreateClient();

    if (!body1.success || !body2.success) {
      throw new Error("Expected both calls to succeed");
    }
    if (fetchCalls !== 1) {
      throw new Error(`Expected 1 refresh fetch call, got ${fetchCalls}`);
    }
    if (state.updateCalls !== 1) {
      throw new Error(`Expected 1 update call, got ${state.updateCalls}`);
    }
  },
});
