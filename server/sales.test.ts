import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as salesDb from "./salesDb";
import * as db from "./db";
import { customersRouter } from "./routers/customers";
import { ordersRouter } from "./routers/orders";

const now = new Date("2026-09-19T00:00:00Z");
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
function context(user: typeof leader | typeof ordinaryStaff | typeof admin | null): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

afterEach(() => vi.restoreAllMocks());

describe("sales access gates", () => {
  it("rejects anonymous but permits active ordinary staff reads", async () => {
    const list = vi.spyOn(salesDb, "listCustomers").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 });
    await expect(customersRouter.createCaller(context(null)).list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(ordinaryPermissions);
    await expect(customersRouter.createCaller(context(ordinaryStaff)).list({})).resolves.toMatchObject({ total: 0 });
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 25 }, { userId: ordinaryStaff.id, isGlobal: false });
  });

  it("permits an active Leader and Super Admin", async () => {
    const list = vi.spyOn(salesDb, "listCustomers").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 1 });
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermissions);
    await expect(customersRouter.createCaller(context(leader)).list({})).resolves.toMatchObject({ total: 0 });
    await expect(customersRouter.createCaller(context(admin)).list({})).resolves.toMatchObject({ total: 0 });
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe("customer promotion", () => {
  it("passes an explicit positive date and preserves idempotence and notes semantics", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermissions);
    const promote = vi.spyOn(salesDb, "promoteLeadToCustomer").mockResolvedValue({ customerId: 41, created: false });
    await expect(customersRouter.createCaller(context(leader)).promote({ leadId: 12, customerSince: 1_725_000_000_000, notes: "Do not overwrite" })).resolves.toEqual({ customerId: 41, created: false });
    expect(promote).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 12,
      customerSince: 1_725_000_000_000,
      notes: "Do not overwrite",
      actorId: leader.id,
      actorName: leader.name,
      actorEmail: leader.email,
    }));
  });

  it("rejects invalid promotion dates before touching the DB", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermissions);
    const promote = vi.spyOn(salesDb, "promoteLeadToCustomer");
    await expect(customersRouter.createCaller(context(leader)).promote({ leadId: 12, customerSince: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(promote).not.toHaveBeenCalled();
  });
});

describe("sales orders", () => {
  it("validates amount/date and duplicate references before DB writes", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermissions);
    const create = vi.spyOn(salesDb, "createSalesOrder");
    await expect(ordersRouter.createCaller(context(leader)).create({
      customerId: 41,
      productName: "Care plan",
      quantity: 1,
      unitPriceCents: -1,
      currency: "USD",
      status: "paid",
      orderedAt: Date.now(),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(ordersRouter.createCaller(context(leader)).create({
      customerId: 41,
      productName: "Care plan",
      quantity: 1,
      unitPriceCents: 1000,
      currency: "USD",
      status: "paid",
      orderedAt: 0,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps credited owner attribution distinct from immutable creator attribution", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermissions);
    const create = vi.spyOn(salesDb, "createSalesOrder").mockResolvedValue({ orderId: 88 });
    await expect(ordersRouter.createCaller(context(leader)).create({
      customerId: 41,
      externalReference: "  EXT-88  ",
      productName: "Care plan",
      quantity: 2,
      unitPriceCents: 1250,
      currency: "EUR",
      status: "paid",
      orderedAt: 1_725_000_000_000,
      ownerUserId: 22,
      notes: "Business note",
    })).resolves.toEqual({ orderId: 88 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 41,
      externalReference: "EXT-88",
      ownerUserId: 22,
      actorId: leader.id,
      actorName: leader.name,
      actorEmail: leader.email,
    }));
  });

  it("maps duplicate external references to a safe conflict", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermissions);
    vi.spyOn(salesDb, "createSalesOrder").mockRejectedValue(Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }));
    await expect(ordersRouter.createCaller(context(leader)).create({
      customerId: 41,
      externalReference: "EXT-88",
      productName: "Care plan",
      quantity: 1,
      unitPriceCents: 1000,
      currency: "USD",
      status: "paid",
      orderedAt: 1_725_000_000_000,
    })).rejects.toMatchObject({ code: "CONFLICT", message: "An order with this external reference already exists." });
  });

  it("returns only the sales order details contract and delegates event scoping to salesDb", async () => {
    vi.spyOn(db, "getStaffPermissionRecord").mockResolvedValue(leaderPermissions);
    const get = vi.spyOn(salesDb, "getSalesOrder").mockResolvedValue({
      order: { id: 88 } as never,
      auditEvents: [{ action: "order.updated", snapshotAfter: { orderId: 88 } }],
    });
    await expect(ordersRouter.createCaller(context(leader)).get({ id: 88 })).resolves.toEqual(expect.objectContaining({ auditEvents: expect.any(Array) }));
    expect(get).toHaveBeenCalledWith(88, { userId: leader.id, isGlobal: true });
  });
});
