import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { and } from "drizzle-orm";
import { getOrderDateRange } from "../shared/orderDates";
import { ordersRouter } from "./routers/orders";
import { buildOrderFilters, orderDateSqlPredicate, orderReadScope } from "./salesDb";
import type { TrpcContext } from "./_core/context";

const dialect = new MySqlDialect();
const leader = {
  id: 17,
  openId: "staff:17",
  name: "Leader Staff",
  email: "leader@example.com",
  loginMethod: "local",
  role: "user" as const,
  createdAt: new Date("2026-09-19T00:00:00Z"),
  updatedAt: new Date("2026-09-19T00:00:00Z"),
  lastSignedIn: new Date("2026-09-19T00:00:00Z"),
};
function context(): TrpcContext {
  return { user: leader, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("purchase date ranges", () => {
  it("rejects malformed and impossible calendar dates", () => {
    expect(() => getOrderDateRange("2026-02-29")).toThrowError(RangeError);
    expect(() => getOrderDateRange("2026-02-29")).toThrow("not a valid calendar date");
    expect(() => getOrderDateRange("2026-04-31")).toThrow("not a valid calendar date");
    expect(() => getOrderDateRange("2026-1-01")).toThrow("YYYY-MM-DD");
  });

  it("rejects a reversed range and accepts same-day ranges", () => {
    expect(() => getOrderDateRange("2026-05-02", "2026-05-01")).toThrow("From must be on or before To");
    const range = getOrderDateRange("2026-05-01", "2026-05-01");
    expect(range.orderedTo! - range.orderedFrom! + 1).toBe(24 * 60 * 60 * 1000);
  });

  it("supports omitted and empty open bounds", () => {
    expect(getOrderDateRange()).toEqual({});
    expect(getOrderDateRange("", "  ")).toEqual({});
    expect(getOrderDateRange("2026-05-01")).toMatchObject({ orderedFrom: expect.any(Number) });
    expect(getOrderDateRange(undefined, "2026-05-01")).toMatchObject({ orderedTo: expect.any(Number) });
  });

  it("uses 23-hour and 25-hour Eastern calendar days across DST", () => {
    const spring = getOrderDateRange("2026-03-08", "2026-03-08");
    const fall = getOrderDateRange("2026-11-01", "2026-11-01");
    expect(spring.orderedTo! - spring.orderedFrom! + 1).toBe(23 * 60 * 60 * 1000);
    expect(fall.orderedTo! - fall.orderedFrom! + 1).toBe(25 * 60 * 60 * 1000);
  });
});

describe("order date SQL filtering", () => {
  it("renders inclusive orderedAt constraints for bounded dates", () => {
    const range = getOrderDateRange("2026-05-01", "2026-05-03");
    const query = dialect.sqlToQuery(orderDateSqlPredicate(range)!);
    expect(query.sql).toBe("(`sales_orders`.`orderedAt` >= ? and `sales_orders`.`orderedAt` <= ?)");
    expect(query.params).toEqual([range.orderedFrom, range.orderedTo]);
  });

  it("keeps date predicates conjoined with the existing owner and other list filters", () => {
    const filters = buildOrderFilters({
      customerId: 41,
      ownerUserId: 17,
      status: "paid",
      search: "plan",
      dateFrom: "2026-05-01",
      dateTo: "2026-05-03",
    });
    const query = dialect.sqlToQuery(and(...filters)!);
    expect(query.sql).toContain("`sales_orders`.`customerId` = ?");
    expect(query.sql).toContain("`sales_orders`.`ownerUserId` = ?");
    expect(query.sql).toContain("`sales_orders`.`status` = ?");
    expect(query.sql).toContain("`sales_orders`.`orderedAt` >= ?");
    expect(query.sql).toContain("`sales_orders`.`orderedAt` <= ?");
    expect(query.params).toContain(17);
    expect(query.params).toContain(getOrderDateRange("2026-05-01", "2026-05-03").orderedFrom);
    expect(query.params).toContain(getOrderDateRange("2026-05-01", "2026-05-03").orderedTo);

    const scopedQuery = dialect.sqlToQuery(and(...filters, orderReadScope({ userId: 17, isGlobal: false })!)!);
    expect(scopedQuery.sql).toContain("`sales_orders`.`ownerUserId` = ?");
    expect(scopedQuery.params.filter(value => value === 17)).toHaveLength(2);
  });

  it("applies the same validated date filter through the list input schema", async () => {
    // The direct schema behavior is covered by the router's public caller contract.
    await expect(ordersRouter.createCaller(context()).list({ dateFrom: "2026-02-29" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(ordersRouter.createCaller(context()).list({ dateFrom: "2026-05-02", dateTo: "2026-05-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
