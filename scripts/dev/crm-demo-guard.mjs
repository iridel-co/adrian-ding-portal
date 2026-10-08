import assert from "node:assert/strict";

export function assertDemoDatabase(value) {
  const url = new URL(value ?? "");
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol), "Demo requires a PostgreSQL URL");
  assert.equal(url.search, "", "Demo refuses database connection overrides");
  assert.equal(url.hash, "", "Demo refuses database connection overrides");
  assert.equal(url.hostname, "127.0.0.1", "Demo requires the isolated Compose database");
  assert.equal(url.port, "55432", "Demo requires the isolated Compose database");
  assert.equal(url.pathname, "/adrian_ding_crm_test", "Demo requires the isolated Compose database");
  return url.toString();
}

export function assertDemoServer(env) {
  assertDemoDatabase(env.DATABASE_URL);
  assert.equal(env.BETTER_AUTH_URL, "http://localhost:3108", "Demo requires the local Portal origin");
  assert.ok(env.RESEND_API_KEY === "re_crm_local_test_only", "Demo refuses a real email key");
  assert.equal(env.CRM_INTAKE_ENABLED, "false", "Demo public intake must remain closed");
  assert.ok([undefined, "false", "true"].includes(env.CRM_DEMO_FAIL_EMAILS), "Use true or false for simulated email failure");
}

export function captureDemoEmail(originalFetch, failEmails = false) {
  return async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname !== "api.resend.com") return originalFetch(input, init);
    assert.equal(url.href, "https://api.resend.com/emails", "Demo refuses unexpected provider requests");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init.headers);
    assert.ok(headers.get("authorization") === "Bearer re_crm_local_test_only", "Demo refuses a real email key");
    headers.delete("authorization");
    if (failEmails) headers.set("x-crm-test-fail", "true");
    return originalFetch("http://127.0.0.1:55825/emails", { ...init, headers });
  };
}
