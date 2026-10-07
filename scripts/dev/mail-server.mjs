// Local development transport. Captures mail; never contacts an email provider.
import http from "node:http";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const seen = new Map();
const capturePath = process.env.MAIL_CAPTURE_PATH ?? new URL("../../.crm-test/mail-capture.jsonl", import.meta.url);
const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "GET" && req.url === "/health") {
    res.end(JSON.stringify({ ok: true, transport: "local-capture" }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/emails") {
    res.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    return;
  }
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 2097152) {
      res.writeHead(413).end(JSON.stringify({ error: "too_large" }));
      return;
    }
  }
  if (req.headers["x-crm-test-fail"] === "true") {
    res.writeHead(503).end(JSON.stringify({ error: "simulated_provider_failure" }));
    return;
  }
  let message;
  try { message = JSON.parse(body); } catch {
    res.writeHead(400).end(JSON.stringify({ error: "invalid_json" }));
    return;
  }
  const key = req.headers["idempotency-key"];
  const prior = key && seen.get(key);
  if (prior && prior.body !== body) {
    res.writeHead(409).end(JSON.stringify({ error: "idempotency_mismatch" }));
    return;
  }
  const id = prior?.id ?? randomUUID();
  if (!prior) {
    appendFileSync(capturePath, JSON.stringify({ id, key, message }) + "\n", { mode: 0o600 });
    if (key) seen.set(key, { id, body });
  }
  res.end(JSON.stringify({ id }));
});
server.listen(55825, process.env.MAIL_HOST ?? "127.0.0.1", () => console.log("Mail capture listening on port 55825"));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close());
