import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ownersQuery: vi.fn(() => ({ data: [] })),
  access: { role: "technical_staff", isActive: true, isLeader: false },
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/orders", vi.fn()],
  useRoute: () => [true, { id: "1" }],
  Link: ({ href, children, ...props }: any) => React.createElement("a", { href, ...props }, children),
}));
vi.mock("../client/src/lib/sales", async importOriginal => {
  const actual = await importOriginal<typeof import("../client/src/lib/sales")>();
  const customer = { id: 1, leadId: 12, fullName: "Own Customer", firstName: "Own", lastName: "Customer", email: "own@example.invalid", phone: null, stateCode: "FL", customerSince: 1_700_000_000_000, notes: null, createdBy: 33, createdByName: "Leader", createdAt: new Date(), updatedAt: new Date(), orderCount: 1, leadStatus: "customer" };
  const order = { id: 1, customerId: 1, customerName: customer.fullName, leadId: 12, reference: "QA-OWN", externalReference: "QA-OWN", productName: "Own Product", quantity: 1, unitPriceCents: 1000, totalCents: 1000, currency: "USD", status: "paid", orderedAt: 1_700_000_000_000, ownerUserId: 17, ownerName: "Me", createdBy: 33, createdByName: "Leader", updatedBy: 33, notes: null, createdAt: new Date(), updatedAt: new Date() };
  return { ...actual, salesTrpc: {
    useUtils: () => Object.fromEntries(["customers", "orders", "leads", "dashboard"].map(key => [key, { invalidate: vi.fn(async () => undefined) }])),
    dashboard: { access: { useQuery: () => ({ data: mocks.access, isLoading: false }) } },
    customers: { delete: { useMutation: () => ({ mutateAsync: vi.fn() }) }, list: { useQuery: () => ({ data: { items: [customer], total: 1, page: 1, pageSize: 25, totalPages: 1 }, isLoading: false }) }, get: { useQuery: () => ({ data: { customer, orders: [order], canOpenLead: false }, isLoading: false, refetch: vi.fn() }) }, choices: { useQuery: () => ({ data: [customer] }) } },
    orders: { delete: { useMutation: () => ({ mutateAsync: vi.fn() }) }, owners: { useQuery: mocks.ownersQuery }, list: { useQuery: () => ({ data: { items: [order], total: 1, page: 1, pageSize: 25, totalPages: 1 }, isLoading: false, refetch: vi.fn() }) }, get: { useQuery: () => ({ data: null, isLoading: false }) } },
  } };
});
import Customers from "../client/src/pages/Customers";
import Orders from "../client/src/pages/Orders";
import CustomerDetail from "../client/src/pages/CustomerDetail";

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); });
afterEach(() => vi.unstubAllGlobals());
describe("ordinary staff read-only sales UI", () => {
  it("renders own customers rather than a Leader-only unavailable screen", () => {
    const html = renderToStaticMarkup(React.createElement(Customers));
    expect(html).toContain("Own Customer");
    expect(html).toContain("Read-only access");
    expect(html).not.toContain("Customers are unavailable");
    expect(html).not.toContain("Delete customer");
  });
  it("renders own orders with no Add/Edit action or staff owner selector", () => {
    const html = renderToStaticMarkup(React.createElement(Orders));
    expect(html).toContain("QA-OWN");
    expect(html).toContain("Read-only access");
    expect(html).not.toContain("Add order");
    expect(html).not.toContain(">Edit<");
    expect(html).not.toContain("Delete order");
    expect(html).not.toContain("All credited owners");
    expect(mocks.ownersQuery).toHaveBeenCalledWith(undefined, { enabled: false });
  });
  it("offers inclusive Eastern purchase-date bounds without granting attribution access", () => {
    const html = renderToStaticMarkup(React.createElement(Orders));
    expect(html).toContain('id="orders-date-from"');
    expect(html).toContain('id="orders-date-to"');
    expect(html).toContain('type="date"');
    expect(html).toContain("Both selected days are included");
    expect(html).not.toContain("data-order-staff-selector");
  });
  it("does not link an order-credited customer to a lead the staff cannot access", () => {
    const html = renderToStaticMarkup(React.createElement(CustomerDetail));
    expect(html).toContain("Own Customer");
    expect(html).not.toContain("Open lead");
    expect(html).not.toContain("Add order");
    expect(html).toContain("orders credited to you");
    expect(html).not.toContain("Delete customer");
    expect(html).not.toContain("Delete order");
  });
});
