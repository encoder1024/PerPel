import { needsRefresh } from "../index.ts";

Deno.test({
  name: "calcom-token-refresh: refresh decision based on expires_at",
  fn: () => {
    const now = Date.parse("2026-02-27T12:00:00.000Z");
    const in15m = new Date(now + 15 * 60 * 1000).toISOString();
    const in5m = new Date(now + 5 * 60 * 1000).toISOString();

    if (needsRefresh(in15m, 600, now)) {
      throw new Error("Should not refresh when token expires in 15m");
    }
    if (!needsRefresh(in5m, 600, now)) {
      throw new Error("Should refresh when token expires in 5m");
    }
    if (!needsRefresh(null, 600, now)) {
      throw new Error("Should refresh when expires_at is null");
    }
    if (!needsRefresh("invalid-date", 600, now)) {
      throw new Error("Should refresh when expires_at is invalid");
    }
  },
});
