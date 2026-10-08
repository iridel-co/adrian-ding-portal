// Loaded only by the guarded demo launcher. Normal builds keep their real transport.
import { assertDemoServer, captureDemoEmail } from "./crm-demo-guard.mjs";
assertDemoServer(process.env);
globalThis.fetch = captureDemoEmail(globalThis.fetch, process.env.CRM_DEMO_FAIL_EMAILS === "true");
