import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { authorizePortalUser, emailList, portalRole } from "./access";

afterEach(() => vi.unstubAllEnvs());
describe("Environment portal roles", () => {
  it("normalizes emails, gives Admin precedence, and grants no role outside the lists", () => {
    expect(emailList(" Admin@Company.test, , STAFF@Company.test ")).toEqual(["admin@company.test", "staff@company.test"]);
    expect(portalRole(" ADMIN@Company.test ", "admin@company.test", "admin@company.test")).toBe("admin");
    expect(portalRole("staff@company.test", "admin@company.test", " STAFF@Company.test ")).toBe("staff");
    expect(portalRole("legacy@company.test", "admin@company.test", "staff@company.test")).toBeNull();
  });
});

describe("Fresh verified portal identity", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAILS", "admin@company.test");
    vi.stubEnv("STAFF_EMAILS", "staff@company.test");
  });
  const fixture = (rows: object[]) => {
    const query = { from: vi.fn(), innerJoin: vi.fn(), where: vi.fn(), limit: vi.fn(async () => rows) };
    for (const method of [query.from, query.innerJoin, query.where]) method.mockReturnValue(query);
    const select = vi.fn(() => query);
    return { db: { select } as unknown as Db, select };
  };
  const staff = { id: "staff-id", name: "Staff", email: "STAFF@company.test", emailVerified: true };

  it("allows verified Staff to manage inquiries but forbids Admin-only actions", async () => {
    const { db } = fixture([staff]);
    expect(await authorizePortalUser(db, staff.id, "staff")).toMatchObject({ role: "staff", email: "staff@company.test" });
    await expect(authorizePortalUser(db, staff.id, "admin")).rejects.toMatchObject({ status: 403, code: "admin_access_required" });
  });
  it("allows Admin to manage both CRM and CMS", async () => {
    const { db } = fixture([{ ...staff, email: "admin@company.test" }]);
    expect((await authorizePortalUser(db, staff.id, "staff")).role).toBe("admin");
    expect((await authorizePortalUser(db, staff.id, "admin")).role).toBe("admin");
  });
  it.each([{ rows: [] }, { rows: [{ ...staff, emailVerified: false }] }, { rows: [{ ...staff, email: "legacy@company.test" }] }])("rejects a missing Google identity, unverified email or unassigned user", async ({ rows }) => {
    const { db } = fixture(rows);
    await expect(authorizePortalUser(db, staff.id, "staff")).rejects.toMatchObject({ status: 403 });
  });
  it("rechecks environment roles when the same session makes another request", async () => {
    const { db } = fixture([staff]);
    await authorizePortalUser(db, staff.id, "staff");
    vi.stubEnv("STAFF_EMAILS", "");
    await expect(authorizePortalUser(db, staff.id, "staff")).rejects.toMatchObject({ status: 403 });
  });
  it("rejects unauthenticated callers without querying the database", async () => {
    const { db, select } = fixture([staff]);
    await expect(authorizePortalUser(db, undefined, "staff")).rejects.toMatchObject({ status: 401 });
    expect(select).not.toHaveBeenCalled();
  });
});
