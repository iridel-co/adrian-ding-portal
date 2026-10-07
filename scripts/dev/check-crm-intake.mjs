import { spawnSync } from "node:child_process";

const url = new URL(process.env.DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/adrian_ding_crm_test") {
  throw new Error("Refusing to test outside the isolated Docker CRM database");
}
const result = spawnSync("pnpm", ["test", "--fileParallelism=false", "src/features/crm/http.test.ts", "src/features/crm/session-lookup.test.ts", "src/features/crm/intake.integration.test.ts", "src/features/crm/email.test.ts", "src/features/crm/email.integration.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, CRM_INTEGRATION_DATABASE_URL: url.toString() }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
