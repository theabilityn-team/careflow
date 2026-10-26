import { describe, expect, it } from "vitest";
import { parseMoneyToCents, parseQuantity, orderPayloadFromDraft, validateOrderDraft, easternDateTimeInput, salesAccessAllowed, salesReadAccessAllowed, type OrderDraft } from "../client/src/lib/sales";

const valid: OrderDraft = { customerId: "12", externalReference: " Invoice-12 ", productName: " Therapy mat ", quantity: "2", unitPrice: "1290.00", currency: "USD", status: "paid", orderedAt: "2026-10-25T19:00", ownerUserId: "", notes: " Manual purchase " };

describe("sales form helpers", () => {
  it("parses exact integer cents without floating-point rounding", () => {
    expect(parseMoneyToCents("1290.00")).toBe(129000);
    expect(parseMoneyToCents("0.29")).toBe(29);
    expect(parseMoneyToCents(" 0 ")).toBe(0);
    expect(parseMoneyToCents("1.005")).toBeNull();
    expect(parseMoneyToCents("-1")).toBeNull();
    expect(parseMoneyToCents("1e3")).toBeNull();
    expect(parseMoneyToCents("1,000.00")).toBeNull();
    expect(parseMoneyToCents("900719925474099100")).toBeNull();
  });
  it("requires positive whole quantity", () => {
    expect(parseQuantity("2")).toBe(2);
    for (const value of ["0", "-1", "1.5", "1e3", ""]) expect(parseQuantity(value)).toBeNull();
  });
  it("normalizes business values and keeps creator independent of credited owner", () => {
    expect(validateOrderDraft(valid)).toBeNull();
    const payload = orderPayloadFromDraft(valid);
    expect(payload).toMatchObject({ customerId: 12, productName: "Therapy mat", externalReference: "Invoice-12", unitPriceCents: 129000, quantity: 2, ownerUserId: undefined, notes: "Manual purchase" });
    expect(payload).not.toHaveProperty("createdBy");
    expect(easternDateTimeInput(payload.orderedAt)).toBe(valid.orderedAt);
    expect(orderPayloadFromDraft(valid, 17).ownerUserId).toBe(17);
    expect(orderPayloadFromDraft({ ...valid, ownerUserId: "22" }, 17).ownerUserId).toBe(22);
  });
  it("rejects missing customer and bad precision before a mutation", () => {
    expect(validateOrderDraft({ ...valid, customerId: "" })).toBe("Select a customer.");
    expect(validateOrderDraft({ ...valid, unitPrice: "1.234" })).toContain("2 decimal");
  });
  it("requires active authoritative sales access, never email permission alone", () => {
    expect(salesAccessAllowed({ role: "technical_staff", isActive: true, isLeader: true })).toBe(true);
    expect(salesReadAccessAllowed({ role: "technical_staff", isActive: true, isLeader: false })).toBe(true);
    expect(salesReadAccessAllowed({ role: "technical_staff", isActive: false })).toBe(false);
    expect(salesAccessAllowed({ role: "super_admin", isActive: true })).toBe(true);
    for (const access of [undefined, {}, { isLeader: true }, { role: "technical_staff", isActive: true, permissions: { manageEmails: true } }, { isLeader: true, isActive: false }]) expect(salesAccessAllowed(access)).toBe(false);
  });
});
