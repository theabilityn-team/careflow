import { enrichAuditValues } from "./auditIdentity";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  aliasedTable,
  isNull,
  like,
  or,
  sql,
} from "drizzle-orm";
import { SYSTEM_ADMIN_ACTOR_ID, SUPER_ADMIN_EMAIL } from "../shared/const";
import {
  auditEvents,
  customers,
  leads,
  salesOrders,
  staffPermissions,
  users,
} from "../drizzle/schema";
import { getOrderDateRange, type OrderDateRange } from "../shared/orderDates";
import { getDb } from "./db";
import { leadChanges, leadSnapshot, parseAuditJson, serializeAudit } from "./leadAudit";

export const SALES_PAGE_SIZE_DEFAULT = 25;
export const SALES_PAGE_SIZE_MAX = 100;
export const ORDER_STATUSES = ["pending", "paid", "fulfilled", "cancelled", "refunded"] as const;
export const ORDER_CURRENCIES = ["USD", "EUR", "GBP"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderCurrency = (typeof ORDER_CURRENCIES)[number];

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
  createdAt: Date;
  updatedAt: Date;
  orderCount: number;
};

export type OrderRow = typeof salesOrders.$inferSelect & {
  reference: string;
  customerName: string;
  leadId: number;
  totalCents: number;
};

type Page = { page: number; pageSize: number; offset: number; total: number; totalPages: number };

export type SalesReadViewer = { userId: number; isGlobal: boolean };

const scopedSalesOrders = aliasedTable(salesOrders, "scoped_orders");

export function customerReadScope(viewer?: SalesReadViewer) {
  if (!viewer || viewer.isGlobal) return undefined;
  return sql`(${leads.createdBy} = ${viewer.userId} or ${leads.assignedTo} = ${viewer.userId} or exists (select 1 from ${salesOrders} as ${sql.identifier("scoped_orders")} where ${scopedSalesOrders.customerId} = ${customers.id} and ${scopedSalesOrders.ownerUserId} = ${viewer.userId}))`;
}

export function orderReadScope(viewer?: SalesReadViewer) {
  if (!viewer || viewer.isGlobal) return undefined;
  return eq(salesOrders.ownerUserId, viewer.userId);
}

function normalizePage(total: number, page = 1, pageSize = SALES_PAGE_SIZE_DEFAULT): Page {
  const safePageSize = Math.min(Math.max(Math.trunc(pageSize || SALES_PAGE_SIZE_DEFAULT), 1), SALES_PAGE_SIZE_MAX);
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(Math.trunc(page || 1), 1), totalPages);
  return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize, total, totalPages };
}

function displayName(name: string | null | undefined, email: string | null | undefined, id: number) {
  return name?.trim() || email?.trim() || `Staff #${id}`;
}

function actorName(id: number, name: string | null | undefined, email: string | null | undefined) {
  return id === SYSTEM_ADMIN_ACTOR_ID ? "Super Administrator" : displayName(name, email, id);
}

function totalCents(quantity: number, unitPriceCents: number) {
  const total = quantity * unitPriceCents;
  if (!Number.isSafeInteger(total)) throw new Error("Order total exceeds the supported amount.");
  return total;
}

function orderReference(id: number, externalReference: string | null) {
  return externalReference || `CF-${String(id).padStart(6, "0")}`;
}

function orderSnapshot(order: Partial<typeof salesOrders.$inferSelect> | null) {
  if (!order) return null;
  return {
    orderId: order.id ?? null,
    customerId: order.customerId ?? null,
    externalReference: order.externalReference ?? null,
    productName: order.productName ?? null,
    quantity: order.quantity ?? null,
    unitPriceCents: order.unitPriceCents ?? null,
    currency: order.currency ?? null,
    status: order.status ?? null,
    orderedAt: order.orderedAt ?? null,
    ownerUserId: order.ownerUserId ?? null,
    ownerName: order.ownerName ?? null,
    createdBy: order.createdBy ?? null,
    createdByName: order.createdByName ?? null,
    updatedBy: order.updatedBy ?? null,
    notes: order.notes ?? null,
  };
}

function orderChanges(before: Partial<typeof salesOrders.$inferSelect> | null, after: Partial<typeof salesOrders.$inferSelect>) {
  const previous = orderSnapshot(before) ?? {};
  const next = orderSnapshot(after) ?? {};
  return Object.keys(next)
    .filter(key => previous[key as keyof typeof previous] !== next[key as keyof typeof next])
    .map(field => ({ field, before: previous[field as keyof typeof previous] ?? null, after: next[field as keyof typeof next] ?? null }));
}

function customerProjection(viewer?: SalesReadViewer) {
  return {
    id: customers.id,
    leadId: customers.leadId,
    fullName: sql<string>`concat(${leads.firstName}, ' ', ${leads.lastName})`,
    firstName: leads.firstName,
    lastName: leads.lastName,
    email: leads.email,
    phone: leads.phone,
    stateCode: leads.stateCode,
    leadStatus: leads.status,
    customerSince: customers.customerSince,
    notes: customers.notes,
    createdBy: customers.createdBy,
    createdByName: sql<string>`coalesce(${users.name}, ${users.email}, case when ${customers.createdBy} = ${SYSTEM_ADMIN_ACTOR_ID} then 'Super Administrator' else concat('Staff #', ${customers.createdBy}) end)`,
    createdAt: customers.createdAt,
    updatedAt: customers.updatedAt,
    orderCount: viewer && !viewer.isGlobal
      ? sql<number>`(select count(*) from ${salesOrders} where ${salesOrders.customerId} = ${customers.id} and ${salesOrders.ownerUserId} = ${viewer.userId})`
      : sql<number>`(select count(*) from ${salesOrders} where ${salesOrders.customerId} = ${customers.id})`,
  };
}

function orderProjection() {
  return {
    ...getTableColumns(salesOrders),
    reference: sql<string>`coalesce(nullif(trim(${salesOrders.externalReference}), ''), concat('CF-', lpad(${salesOrders.id}, 6, '0')))` ,
    customerName: sql<string>`concat(${leads.firstName}, ' ', ${leads.lastName})`,
    leadId: customers.leadId,
    totalCents: sql<number>`${salesOrders.quantity} * ${salesOrders.unitPriceCents}`,
  };
}

function buildCustomerSearch(search: string | undefined) {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = `%${term}%`;
  return or(
    like(leads.firstName, pattern),
    like(leads.lastName, pattern),
    like(leads.email, pattern),
    like(leads.phone, pattern),
    like(leads.stateCode, pattern),
    sql`${customers.id} like ${pattern}`,
    sql`concat(${leads.firstName}, ' ', ${leads.lastName}) like ${pattern}`,
  );
}

export async function listCustomers(input: { search?: string; stateCode?: string; page?: number; pageSize?: number }, viewer?: SalesReadViewer) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const filters = [];
  const scope = customerReadScope(viewer);
  if (scope) filters.push(scope);
  const search = buildCustomerSearch(input.search);
  if (search) filters.push(search);
  if (input.stateCode) filters.push(eq(leads.stateCode, input.stateCode));
  const where = filters.length ? and(...filters) : undefined;
  const count = await db.select({ count: sql<number>`count(*)` }).from(customers).innerJoin(leads, eq(leads.id, customers.leadId)).where(where);
  const pagination = normalizePage(Number(count[0]?.count ?? 0), input.page, input.pageSize);
  const items = await db.select(customerProjection(viewer))
    .from(customers)
    .innerJoin(leads, eq(leads.id, customers.leadId))
    .leftJoin(users, eq(users.id, customers.createdBy))
    .where(where)
    .orderBy(desc(customers.updatedAt), asc(leads.lastName), asc(leads.firstName))
    .limit(pagination.pageSize)
    .offset(pagination.offset);
  return { items: items.map(normalizeCustomerRow), ...paginationWithoutOffset(pagination) };
}

function paginationWithoutOffset(pagination: Page) {
  return { total: pagination.total, page: pagination.page, pageSize: pagination.pageSize, totalPages: pagination.totalPages };
}

function normalizeCustomerRow(row: CustomerRow & { orderCount: number | string }) {
  return { ...row, orderCount: Number(row.orderCount ?? 0), fullName: row.fullName.trim() };
}

export async function listCustomerChoices(search?: string, viewer?: SalesReadViewer) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const filters = [];
  const scope = customerReadScope(viewer);
  if (scope) filters.push(scope);
  const searchFilter = buildCustomerSearch(search);
  if (searchFilter) filters.push(searchFilter);
  const where = filters.length ? and(...filters) : undefined;
  const rows = await db.select({
    id: customers.id,
    leadId: customers.leadId,
    fullName: sql<string>`concat(${leads.firstName}, ' ', ${leads.lastName})`,
    email: leads.email,
    stateCode: leads.stateCode,
  }).from(customers).innerJoin(leads, eq(leads.id, customers.leadId)).where(where)
    .orderBy(asc(leads.lastName), asc(leads.firstName)).limit(100);
  return rows.map(row => ({ ...row, fullName: row.fullName.trim() }));
}

export async function getCustomerByLead(leadId: number, viewer?: SalesReadViewer) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const scope = customerReadScope(viewer);
  const rows = await db.select({ id: customers.id, leadId: customers.leadId, customerSince: customers.customerSince })
    .from(customers).innerJoin(leads, eq(leads.id, customers.leadId))
    .where(scope ? and(eq(customers.leadId, leadId), scope) : eq(customers.leadId, leadId)).limit(1);
  return rows[0] ?? null;
}

export async function getCustomer(id: number, viewer?: SalesReadViewer) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const scope = customerReadScope(viewer);
  const customer = (await db.select(customerProjection(viewer)).from(customers)
    .innerJoin(leads, eq(leads.id, customers.leadId))
    .leftJoin(users, eq(users.id, customers.createdBy))
    .where(scope ? and(eq(customers.id, id), scope) : eq(customers.id, id)).limit(1))[0];
  if (!customer) return null;
  const orderScope = orderReadScope(viewer);
  const orders = await db.select(orderProjection()).from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId))
    .innerJoin(leads, eq(leads.id, customers.leadId))
    .where(orderScope ? and(eq(salesOrders.customerId, id), orderScope) : eq(salesOrders.customerId, id)).orderBy(desc(salesOrders.orderedAt), desc(salesOrders.id)).limit(100);
  return { customer: normalizeCustomerRow(customer), orders: orders.map(normalizeOrderRow) };
}

export async function promoteLeadToCustomer(input: { leadId: number; customerSince: number; notes: string | null; actorId: number; actorName: string | null; actorEmail: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.transaction(async tx => {
    const lead = (await tx.select().from(leads).where(eq(leads.id, input.leadId)).limit(1).for("update"))[0];
    if (!lead) return null;
    const existing = (await tx.select({ id: customers.id }).from(customers).where(eq(customers.leadId, input.leadId)).limit(1).for("update"))[0];
    if (existing) return { customerId: existing.id, created: false };
    const created = await tx.insert(customers).values({
      leadId: input.leadId,
      customerSince: input.customerSince,
      notes: input.notes,
      createdBy: input.actorId,
    });
    const customerId = Number(created[0].insertId);
    const afterLead = { ...lead, status: "customer" as const };
    if (lead.status !== "customer") await tx.update(leads).set({ status: "customer" }).where(eq(leads.id, input.leadId));
    await tx.insert(auditEvents).values(enrichAuditValues({
        leadId: input.leadId,
        actorId: input.actorId,
        action: "customer.promoted",
        source: "manual",
        detail: `Confirmed customer #${customerId} for existing lead #${input.leadId}.`,
        changes: serializeAudit(leadChanges(lead, afterLead)),
        snapshotBefore: serializeAudit(leadSnapshot(lead)),
        snapshotAfter: serializeAudit(leadSnapshot(afterLead)),
        occurredAt: Date.now(),
      }));
    return { customerId, created: true };
  });
}

export function orderDateSqlPredicate(range: OrderDateRange) {
  const filters = [];
  if (range.orderedFrom !== undefined) filters.push(sql`${salesOrders.orderedAt} >= ${range.orderedFrom}`);
  if (range.orderedTo !== undefined) filters.push(sql`${salesOrders.orderedAt} <= ${range.orderedTo}`);
  return filters.length ? and(...filters) : undefined;
}

export function buildOrderFilters(input: { search?: string; customerId?: number; ownerUserId?: number; status?: OrderStatus; dateFrom?: string; dateTo?: string }) {
  const filters = [];
  if (input.customerId) filters.push(eq(salesOrders.customerId, input.customerId));
  if (input.ownerUserId) filters.push(eq(salesOrders.ownerUserId, input.ownerUserId));
  if (input.status) filters.push(eq(salesOrders.status, input.status));
  const dateFilter = orderDateSqlPredicate(getOrderDateRange(input.dateFrom, input.dateTo));
  if (dateFilter) filters.push(dateFilter);
  const term = input.search?.trim();
  if (term) {
    const pattern = `%${term}%`;
    filters.push(or(
      like(salesOrders.externalReference, pattern),
      sql`coalesce(nullif(trim(${salesOrders.externalReference}), ''), concat('CF-', lpad(${salesOrders.id}, 6, '0'))) like ${pattern}`,
      like(salesOrders.productName, pattern),
      like(leads.firstName, pattern),
      like(leads.lastName, pattern),
      like(leads.email, pattern),
      sql`concat(${leads.firstName}, ' ', ${leads.lastName}) like ${pattern}`,
    )!);
  }
  return filters;
}

export async function listOrders(input: { search?: string; customerId?: number; ownerUserId?: number; status?: OrderStatus; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number }, viewer?: SalesReadViewer) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const filters = buildOrderFilters(input);
  const scope = orderReadScope(viewer);
  if (scope) filters.push(scope);
  const where = filters.length ? and(...filters) : undefined;
  const count = await db.select({ count: sql<number>`count(*)` }).from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId)).innerJoin(leads, eq(leads.id, customers.leadId)).where(where);
  const pagination = normalizePage(Number(count[0]?.count ?? 0), input.page, input.pageSize);
  const items = await db.select(orderProjection()).from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId)).innerJoin(leads, eq(leads.id, customers.leadId))
    .where(where).orderBy(desc(salesOrders.orderedAt), desc(salesOrders.id)).limit(pagination.pageSize).offset(pagination.offset);
  return { items: items.map(normalizeOrderRow), ...paginationWithoutOffset(pagination) };
}

function normalizeOrderRow(row: OrderRow & { quantity: number | string; unitPriceCents: number | string; totalCents: number | string }) {
  return {
    ...row,
    quantity: Number(row.quantity),
    unitPriceCents: Number(row.unitPriceCents),
    totalCents: Number(row.totalCents),
    reference: row.reference || orderReference(row.id, row.externalReference),
    customerName: row.customerName.trim(),
  };
}

async function getStaffOwner(tx: any, userId: number) {
  if (userId === SYSTEM_ADMIN_ACTOR_ID) return { userId, name: "Super Administrator", email: SUPER_ADMIN_EMAIL, isActive: true, isSuperAdmin: true };
  const row = (await tx.select({
    userId: users.id,
    name: users.name,
    email: users.email,
    isActive: staffPermissions.isActive,
    role: users.role,
  }).from(users).innerJoin(staffPermissions, eq(staffPermissions.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.role, "user"), eq(staffPermissions.isActive, true))).limit(1))[0];
  return row ? { ...row, isActive: true, isSuperAdmin: false, name: displayName(row.name, row.email, row.userId) } : null;
}

export async function listSalesOwners(currentActorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ userId: users.id, name: users.name, email: users.email, isActive: staffPermissions.isActive })
    .from(users).innerJoin(staffPermissions, eq(staffPermissions.userId, users.id))
    .where(and(eq(users.role, "user"), eq(staffPermissions.isActive, true))).orderBy(asc(users.name), asc(users.id));
  const owners = rows.map(row => ({ userId: row.userId, name: displayName(row.name, row.email, row.userId), email: row.email, isActive: true, isSuperAdmin: false }));
  owners.unshift({ userId: SYSTEM_ADMIN_ACTOR_ID, name: "Super Administrator", email: SUPER_ADMIN_EMAIL, isActive: true, isSuperAdmin: true });
  if (currentActorId !== SYSTEM_ADMIN_ACTOR_ID && !owners.some(owner => owner.userId === currentActorId)) {
    const current = await db.select({ userId: users.id, name: users.name, email: users.email, role: users.role, isActive: staffPermissions.isActive })
      .from(users).leftJoin(staffPermissions, eq(staffPermissions.userId, users.id)).where(eq(users.id, currentActorId)).limit(1);
    if (current[0] && (current[0].role === "admin" || current[0].isActive === true)) {
      owners.push({ userId: current[0].userId, name: displayName(current[0].name, current[0].email, current[0].userId), email: current[0].email, isActive: true, isSuperAdmin: current[0].role === "admin" });
    }
  }
  return owners;
}

export type OrderWrite = {
  customerId: number;
  externalReference: string | null;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  currency: OrderCurrency;
  status: OrderStatus;
  orderedAt: number;
  ownerUserId?: number;
  notes: string | null;
};

export async function createSalesOrder(input: OrderWrite & { actorId: number; actorName: string | null; actorEmail: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  totalCents(input.quantity, input.unitPriceCents);
  return db.transaction(async tx => {
    const customer = (await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1).for("update"))[0];
    if (!customer) return null;
    const ownerId = input.ownerUserId ?? input.actorId;
    const owner = await getStaffOwner(tx, ownerId);
    if (!owner) throw Object.assign(new Error("Select an active credited staff member."), { code: "INVALID_OWNER" });
    const creatorName = actorName(input.actorId, input.actorName, input.actorEmail);
    const result = await tx.insert(salesOrders).values({
      customerId: input.customerId,
      externalReference: input.externalReference,
      productName: input.productName,
      quantity: input.quantity,
      unitPriceCents: input.unitPriceCents,
      currency: input.currency,
      status: input.status,
      orderedAt: input.orderedAt,
      ownerUserId: ownerId,
      ownerName: owner.name,
      createdBy: input.actorId,
      createdByName: creatorName,
      updatedBy: input.actorId,
      notes: input.notes,
    });
    const orderId = Number(result[0].insertId);
    const order = (await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1))[0];
    await tx.insert(auditEvents).values(enrichAuditValues({
      leadId: null,
      actorId: input.actorId,
      action: "order.created",
      source: "manual",
      detail: `Created order ${orderReference(orderId, order.externalReference)}`,
      changes: serializeAudit(orderChanges(null, order)),
      snapshotBefore: null,
      snapshotAfter: serializeAudit(orderSnapshot(order)),
      occurredAt: Date.now(),
    }));
    return { orderId };
  });
}

export async function updateSalesOrder(input: OrderWrite & { id: number; actorId: number; actorName: string | null; actorEmail: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  totalCents(input.quantity, input.unitPriceCents);
  return db.transaction(async tx => {
    const before = (await tx.select().from(salesOrders).where(eq(salesOrders.id, input.id)).limit(1).for("update"))[0];
    if (!before) return null;
    const customer = (await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, input.customerId)).limit(1))[0];
    if (!customer) throw Object.assign(new Error("Customer not found."), { code: "CUSTOMER_NOT_FOUND" });
    const ownerId = input.ownerUserId ?? before.ownerUserId;
    let ownerName = before.ownerName;
    if (ownerId !== before.ownerUserId) {
      const owner = await getStaffOwner(tx, ownerId);
      if (!owner) throw Object.assign(new Error("Select an active credited staff member."), { code: "INVALID_OWNER" });
      ownerName = owner.name;
    }
    const afterInput = {
      customerId: input.customerId,
      externalReference: input.externalReference,
      productName: input.productName,
      quantity: input.quantity,
      unitPriceCents: input.unitPriceCents,
      currency: input.currency,
      status: input.status,
      orderedAt: input.orderedAt,
      ownerUserId: ownerId,
      ownerName,
      updatedBy: input.actorId,
      notes: input.notes,
    };
    const changed = orderChanges(before, { ...before, ...afterInput });
    if (!changed.length) return { orderId: input.id, changed: false };
    await tx.update(salesOrders).set(afterInput).where(eq(salesOrders.id, input.id));
    const after = { ...before, ...afterInput };
    const reassigned = before.ownerUserId !== after.ownerUserId;
    const businessChanges = changed.filter(change => change.field !== "updatedBy");
    if (businessChanges.length) {
      await tx.insert(auditEvents).values(enrichAuditValues({
        leadId: null,
        actorId: input.actorId,
        action: reassigned && businessChanges.length === 1 ? "order.reassigned" : "order.updated",
        source: "manual",
        detail: reassigned ? `Updated order ${orderReference(input.id, after.externalReference)} and reassigned credited staff` : `Updated order ${orderReference(input.id, after.externalReference)}`,
        changes: serializeAudit(businessChanges),
        snapshotBefore: serializeAudit(orderSnapshot(before)),
        snapshotAfter: serializeAudit(orderSnapshot(after)),
        occurredAt: Date.now(),
      }));
    }
    if (reassigned && businessChanges.length > 1) {
      await tx.insert(auditEvents).values(enrichAuditValues({
        leadId: null,
        actorId: input.actorId,
        action: "order.reassigned",
        source: "manual",
        detail: `Reassigned credited staff for order ${orderReference(input.id, after.externalReference)}`,
        changes: serializeAudit(changed.filter(change => change.field === "ownerUserId" || change.field === "ownerName")),
        snapshotBefore: serializeAudit(orderSnapshot(before)),
        snapshotAfter: serializeAudit(orderSnapshot(after)),
        occurredAt: Date.now(),
      }));
    }
    return { orderId: input.id, changed: true };
  });
}

export async function getSalesOrder(id: number, viewer?: SalesReadViewer) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const scope = orderReadScope(viewer);
  const order = (await db.select(orderProjection()).from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId)).innerJoin(leads, eq(leads.id, customers.leadId))
    .where(scope ? and(eq(salesOrders.id, id), scope) : eq(salesOrders.id, id)).limit(1))[0];
  if (!order) return null;
  const events = await db.select({
    id: auditEvents.id,
    leadId: auditEvents.leadId,
    actorId: auditEvents.actorId,
      impersonatedById: auditEvents.impersonatedById,
      impersonatedByName: auditEvents.impersonatedByName,
    actorName: users.name,
    actorEmail: users.email,
    action: auditEvents.action,
    source: auditEvents.source,
    detail: auditEvents.detail,
    changes: auditEvents.changes,
    snapshotBefore: auditEvents.snapshotBefore,
    snapshotAfter: auditEvents.snapshotAfter,
    occurredAt: auditEvents.occurredAt,
  }).from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorId)).where(and(
    isNull(auditEvents.leadId),
    like(auditEvents.action, "order.%"),
    like(auditEvents.snapshotAfter, `%\"orderId\":${id},%`),
  )).orderBy(desc(auditEvents.occurredAt));
  return {
    order: normalizeOrderRow(order),
    auditEvents: events.map(event => ({
      ...event,
      actorName: actorName(event.actorId, event.actorName, event.actorEmail),
      changes: parseAuditJson(event.changes, []),
      snapshotBefore: parseAuditJson(event.snapshotBefore, null),
      snapshotAfter: parseAuditJson(event.snapshotAfter, null),
    })),
  };
}

export function isDuplicateSalesReference(error: unknown): boolean {
  const candidate = error as { code?: unknown; errno?: unknown; sqlMessage?: unknown; cause?: unknown } | null;
  const text = `${candidate?.code ?? ""} ${candidate?.errno ?? ""} ${candidate?.sqlMessage ?? ""}`.toLowerCase();
  return text.includes("duplicate") || text.includes("er_dup_entry") || text.includes("1062") || Boolean(candidate?.cause && candidate.cause !== error && isDuplicateSalesReference(candidate.cause));
}
