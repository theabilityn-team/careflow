import { describe, expect, it } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { customerReadScope, orderReadScope } from "./salesDb";

const dialect = new MySqlDialect();
describe("sales ownership SQL scopes", () => {
  it("uses a real FROM table plus explicit alias for credited-order customer membership", () => {
    const query = dialect.sqlToQuery(customerReadScope({ userId: 17, isGlobal: false })!);
    expect(query.sql).toContain('from `sales_orders` as `scoped_orders`');
    expect(query.sql).toContain('`scoped_orders`.`customerId` = `customers`.`id`');
    expect(query.sql).not.toContain('from `scoped_orders` where');
    expect(query.params).toEqual([17, 17, 17]);
  });
  it("scopes orders by credited owner, never their creator or shared lead", () => {
    const query = dialect.sqlToQuery(orderReadScope({ userId: 17, isGlobal: false })!);
    expect(query.sql).toBe('`sales_orders`.`ownerUserId` = ?');
    expect(query.params).toEqual([17]);
    expect(customerReadScope({ userId: 17, isGlobal: true })).toBeUndefined();
    expect(orderReadScope({ userId: 17, isGlobal: true })).toBeUndefined();
  });
});
