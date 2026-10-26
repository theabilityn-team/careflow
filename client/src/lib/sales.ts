import { formatEasternDate, parseEasternDateTimeInput } from "@shared/time";
import { trpc } from "@/lib/trpc";

/** Typed alias for the application's real tRPC client. */
export const salesTrpc = trpc;

export const SALES_CURRENCIES = ["USD", "EUR", "GBP"] as const;
export type SalesCurrency = (typeof SALES_CURRENCIES)[number];
export const ORDER_STATUSES = ["pending", "paid", "fulfilled", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type CustomerRow = {
  id: number;
  leadId: number;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  stateCode: string | null;
  leadStatus: string;
  customerSince: number;
  notes: string | null;
  createdBy: number;
  createdByName: string;
  createdAt: number | Date;
  updatedAt: number | Date;
  orderCount: number;
};

export type CustomerChoice = Pick<CustomerRow, "id" | "leadId" | "fullName" | "email" | "stateCode">;

export type OrderRow = {
  id: number;
  customerId: number;
  externalReference: string | null;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  currency: SalesCurrency;
  status: OrderStatus;
  orderedAt: number;
  ownerUserId: number;
  ownerName: string;
  createdBy: number;
  createdByName: string;
  updatedBy: number;
  notes: string | null;
  createdAt: number | Date;
  updatedAt: number | Date;
  reference: string;
  customerName: string;
  leadId: number;
  totalCents: number;
};

export type OrderOwner = { userId: number; name: string; email: string | null; isActive: boolean; isSuperAdmin: boolean };
export type SalesPage<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

export type OrderDraft = {
  customerId: string;
  externalReference: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  currency: SalesCurrency;
  status: OrderStatus;
  orderedAt: string;
  ownerUserId: string;
  notes: string;
};

export function parseMoneyToCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

export function centsToMoney(cents: number, currency: string = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export function centsToInput(cents: number | null | undefined) {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);
}

export function parseQuantity(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

export function validateOrderDraft(draft: OrderDraft, requireCustomer = true): string | null {
  if (requireCustomer && (!draft.customerId || !Number.isInteger(Number(draft.customerId)) || Number(draft.customerId) <= 0)) return "Select a customer.";
  if (!draft.productName.trim()) return "Product or service name is required.";
  if (draft.productName.trim().length > 160) return "Product or service name must be 160 characters or fewer.";
  if (!parseQuantity(draft.quantity)) return "Quantity must be a whole number greater than zero.";
  if (parseMoneyToCents(draft.unitPrice) === null) return "Enter a non-negative amount with no more than 2 decimal places.";
  if (!SALES_CURRENCIES.includes(draft.currency)) return "Select a supported currency.";
  if (!ORDER_STATUSES.includes(draft.status)) return "Select a valid order status.";
  if (!draft.orderedAt || !Number.isFinite(parseEasternDateTimeInput(draft.orderedAt))) return "Select a valid Eastern Time order date.";
  if (draft.externalReference.trim().length > 80) return "External reference must be 80 characters or fewer.";
  return null;
}

export function orderPayloadFromDraft(draft: OrderDraft, currentActorId?: number) {
  return {
    customerId: Number(draft.customerId),
    externalReference: draft.externalReference.trim() || null,
    productName: draft.productName.trim(),
    quantity: parseQuantity(draft.quantity) as number,
    unitPriceCents: parseMoneyToCents(draft.unitPrice) as number,
    currency: draft.currency,
    status: draft.status,
    orderedAt: parseEasternDateTimeInput(draft.orderedAt),
    ownerUserId: draft.ownerUserId ? Number(draft.ownerUserId) : currentActorId,
    notes: draft.notes.trim() || null,
  };
}

export function draftFromOrder(order: Partial<OrderRow> & { customerId: number; orderedAt: number }): OrderDraft {
  return {
    customerId: String(order.customerId),
    externalReference: order.externalReference ?? "",
    productName: order.productName ?? "",
    quantity: String(order.quantity ?? 1),
    unitPrice: centsToInput(order.unitPriceCents),
    currency: order.currency ?? "USD",
    status: order.status ?? "paid",
    orderedAt: easternDateTimeInput(order.orderedAt),
    ownerUserId: order.ownerUserId ? String(order.ownerUserId) : "",
    notes: order.notes ?? "",
  };
}

export function easternDateTimeInput(value?: number | Date | null) {
  if (value === null || value === undefined) return "";
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date).reduce<Record<string, string>>((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatSalesDate(value?: number | Date | null, includeTime = false) {
  return formatEasternDate(value, includeTime);
}

export function displayOrderReference(order: Pick<OrderRow, "reference" | "id">) {
  return order.reference || `CF-${String(order.id).padStart(6, "0")}`;
}

export function salesAccessAllowed(access: unknown): boolean {
  const value = access as { isLeader?: boolean; role?: string; isActive?: boolean } | null | undefined;
  return Boolean(value?.isActive === true && (value.isLeader === true || value.role === "super_admin"));
}

export function salesReadAccessAllowed(access: unknown): boolean {
  const value = access as { role?: string; isActive?: boolean } | null | undefined;
  return Boolean(value?.isActive === true && (value.role === "technical_staff" || value.role === "super_admin"));
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
