import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as salesDb from "./salesDb";
import * as db from "./db";
import { appRouter } from "./routers";

const now = new Date("2026-10-26T00:00:00Z");
const leader = {
  id: 17,
  openId: "staff:17",
  name: "Leader Staff",
  email: "leader@example.com",
  loginMethod: "local",
  role: "user" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const ordinaryStaff = { ...leader, id: 18, name: "Ordinary Staff", email: "staff@example.com" };
const inactiveLeader = { ...leader, id: 19, name: "Inactive Leader", email: "inactive@example.com" };
const admin = {
  id: 30_001,
  openId: "system:super-admin",
  name: "Super Administrator",
  email: "admin@admin.com",
  loginMethod: "system",
  role: "admin" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const leaderPermissions = {
  userId: leader.id,
  jobTitle: "Leader",
  isActive: true,
  permissions: JSON.stringify({ manageSales: true }),
};
const ordinaryPermissions = {
  ...leaderPermissions,
  userId: ordinaryStaff.id,
  jobTitle: "Technical Staff",
  permissions: JSON.stringify({ viewLeads: true }),
};
const inactivePermissions = {
  ...leaderPermissions,
  userId: inactiveLeader.id,
  isActive: false,
};

function context(user: typeof leader | typeof ordinaryStaff | typeof inactiveLeader | typeof admin | null): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function leaderCaller() {
  vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermissions);
  return appRouter.createCaller(context(leader));
}

afterEach(() => vi.restoreAllMocks());

describe("sales deletion access and input contracts", () => {
  it("allows active leaders and super admins, while ordinary and inactive staff are rejected before helpers", async () => {
    const deleteCustomer = vi.spyOn(salesDb, "deleteSalesCustomer").mockResolvedValue({ customerId: 11, leadId: 12, deletedOrderCount: 0 });
    const deleteOrder = vi.spyOn(salesDb, "deleteSalesOrder").mockResolvedValue({ orderId: 21, customerId: 11 });

    await expect(leaderCaller().customers.delete({ id: 11 })).resolves.toEqual({ customerId: 11, leadId: 12, deletedOrderCount: 0 });
    await expect(appRouter.createCaller(context(admin)).orders.delete({ id: 21 })).resolves.toEqual({ orderId: 21, customerId: 11 });

    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ordinaryPermissions);
    await expect(appRouter.createCaller(context(ordinaryStaff)).customers.delete({ id: 11 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(inactivePermissions);
    await expect(appRouter.createCaller(context(inactiveLeader)).orders.delete({ id: 21 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deleteCustomer).toHaveBeenCalledTimes(1);
    expect(deleteOrder).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed ids and expected counts before calling deletion helpers", async () => {
    const deleteCustomer = vi.spyOn(salesDb, "deleteSalesCustomer");
    const deleteOrder = vi.spyOn(salesDb, "deleteSalesOrder");
    const caller = leaderCaller();
    for (const id of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(caller.customers.delete({ id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller.orders.delete({ id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    for (const expectedOrderCount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(caller.customers.delete({ id: 11, expectedOrderCount })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(deleteCustomer).not.toHaveBeenCalled();
    expect(deleteOrder).not.toHaveBeenCalled();
  });

  it("maps missing records and helper conflicts to intentional safe TRPC errors", async () => {
    const caller = leaderCaller();
    vi.spyOn(salesDb, "deleteSalesCustomer").mockResolvedValue(null);
    vi.spyOn(salesDb, "deleteSalesOrder").mockResolvedValue(null);
    await expect(caller.customers.delete({ id: 11 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Customer not found." });
    await expect(caller.orders.delete({ id: 21 })).rejects.toMatchObject({ code: "NOT_FOUND", message: "Order not found." });

    vi.spyOn(salesDb, "deleteSalesCustomer").mockRejectedValue(Object.assign(new Error("actual SQL details"), { code: "CONFLICT" }));
    vi.spyOn(salesDb, "deleteSalesOrder").mockRejectedValue(Object.assign(new Error("actual SQL details"), { code: "CONFLICT" }));
    await expect(caller.customers.delete({ id: 11, expectedOrderCount: 2 })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(caller.orders.delete({ id: 21 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("hides nested database error details behind generic deletion messages", async () => {
    const caller = leaderCaller();
    const nested = Object.assign(new Error("mysql://secret-user:secret-password@db.internal/clinical"), {
      cause: Object.assign(new Error("ER_LOCK_DEADLOCK secret table details"), { sqlMessage: "secret SQL" }),
    });
    vi.spyOn(salesDb, "deleteSalesCustomer").mockRejectedValue(nested);
    vi.spyOn(salesDb, "deleteSalesOrder").mockRejectedValue(nested);
    await expect(caller.customers.delete({ id: 11 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "The customer could not be deleted. Please try again.",
    });
    await expect(caller.orders.delete({ id: 21 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "The order could not be deleted. Please try again.",
    });
    await expect(caller.customers.delete({ id: 11 })).rejects.not.toThrow("secret");
  });

  it("takes actor provenance from the authenticated context rather than client input", async () => {
    const deleteCustomer = vi.spyOn(salesDb, "deleteSalesCustomer").mockResolvedValue({ customerId: 11, leadId: 12, deletedOrderCount: 0 });
    const caller = leaderCaller();
    await expect(caller.customers.delete({ id: 11 })).resolves.toBeDefined();
    expect(deleteCustomer).toHaveBeenCalledWith({
      id: 11,
      expectedOrderCount: undefined,
      actorId: leader.id,
      actorName: leader.name,
      actorEmail: leader.email,
    });
    expect(deleteCustomer.mock.calls[0]?.[0]).not.toHaveProperty("impersonatedById");
  });
});
