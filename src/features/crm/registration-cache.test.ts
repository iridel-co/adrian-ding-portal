import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ version: 1, sessions: vi.fn(), session: vi.fn(), registrations: vi.fn(), detail: vi.fn() }));
vi.mock("./functions", () => ({ $listRegistrationSessions: server.sessions, $getRegistrationSession: server.session,
  $listRegistrations: server.registrations, $getRegistration: server.detail }));
import { registrationQueryKey, registrationQueryOptions, registrationSessionQueryOptions,
  registrationSessionsQueryOptions, registrationsQueryOptions } from "./registration-queries";

const id = "12345678-abcd-4000-8000-123456789abc";
function views() {
  return [
    registrationSessionsQueryOptions({ when: "upcoming", offset: 0, limit: 50 }),
    registrationSessionQueryOptions(id),
    registrationsQueryOptions({ workshopSessionId: id, filter: "all", search: "", offset: 0, limit: 5 }),
    registrationsQueryOptions({ workshopSessionId: id, filter: "active", search: "Alice", offset: 50, limit: 50 }),
    registrationQueryOptions(id),
    registrationQueryOptions(id, 20)
  ];
}

// Exercise Query's real observers: checking invalidateQueries' arguments alone
// cannot show that every workspace/detail/history key actually refetches.
describe("Registration cache lifecycle", () => {
  it("refreshes all active registration views after a staff action without affecting inquiries", async () => {
    server.version = 1;
    for (const method of [server.sessions, server.session, server.registrations, server.detail]) {
      method.mockReset().mockImplementation(async () => ({ version: server.version }));
    }
    const client = new QueryClient();
    const options = views();
    const observers = options.map(option => new QueryObserver(client, option as Parameters<typeof client.fetchQuery>[0]));
    const unsubscribes = observers.map(observer => observer.subscribe(() => {}));
    try {
      await Promise.all(observers.map(observer => observer.refetch()));
      client.setQueryData(["corporate-inquiries", "list"], { unchanged: true });
      server.version = 2;
      await client.invalidateQueries({ queryKey: registrationQueryKey });
      for (const option of options) expect(client.getQueryData(option.queryKey)).toEqual({ version: 2 });
      expect(server.registrations).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ limit: 5, filter: "all" }) }));
      expect(server.registrations).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ limit: 50, offset: 50, search: "Alice" }) }));
      expect(server.detail).toHaveBeenCalledWith(expect.objectContaining({ data: { id, offset: 20, limit: 20 } }));
      expect(client.getQueryState(["corporate-inquiries", "list"])?.isInvalidated).toBe(false);
    } finally { unsubscribes.forEach(unsubscribe => unsubscribe()); client.clear(); }
  });

  it("removes inactive private registration data when its views unmount", async () => {
    server.detail.mockReset().mockResolvedValue({ privateContact: "qa@example.invalid" });
    const client = new QueryClient();
    const options = registrationQueryOptions(id);
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => {});
    try {
      await observer.refetch();
      expect(client.getQueryData(options.queryKey)).toEqual({ privateContact: "qa@example.invalid" });
      unsubscribe();
      await vi.waitFor(() => expect(client.getQueryData(options.queryKey)).toBeUndefined());
    } finally { unsubscribe(); client.clear(); }
  });
});
