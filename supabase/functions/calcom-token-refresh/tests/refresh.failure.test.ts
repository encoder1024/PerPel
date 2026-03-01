import { handler } from "../index.ts";
import { buildMockSupabase, clearMockCreateClient, setMockCreateClient } from "./_mock.ts";

Deno.test({
  name: "calcom-token-refresh: refresh fails and does not mutate tokens",
  fn: async () => {
    const { createClient, state } = buildMockSupabase();
    setMockCreateClient(createClient);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "invalid_grant" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

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

    if (body.success) throw new Error("Expected success false");
    if (state.updateCalls !== 0) throw new Error("Expected no update calls");
    if (state.insertCalls < 1) throw new Error("Expected failure log insert");
  },
});
