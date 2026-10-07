import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = new URL(process.env.DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/adrian_ding_crm_test") {
  throw new Error("Refusing to operate outside the isolated CRM test database");
}
const command = process.argv[2] ?? "status";
if (!["status", "migrate"].includes(command)) {
  throw new Error("Usage: node --env-file=.env.crm-test scripts/dev/db.mjs [status|migrate]");
}
const sql = postgres(url.toString(), { max: 1 });
try {
  if (command === "migrate") await migrate(drizzle({ client: sql }), { migrationsFolder: "./drizzle" });
  const tables = await sql`select tablename from pg_tables where schemaname = 'public' order by tablename`;
  const ledger = await sql`select count(*)::int as count from drizzle.__drizzle_migrations`;
  console.log(JSON.stringify({ database: url.pathname.slice(1), migrations: ledger[0].count, tables: tables.map(row => row.tablename) }));
} finally { await sql.end(); }
