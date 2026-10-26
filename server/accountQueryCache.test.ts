import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { clearAccountQueries } from "../client/src/lib/accountQueryCache";

const me = [["auth", "me"], { type: "query" }] as const;
const orders = [["orders", "list"], { input: {}, type: "query" }] as const;
describe("account data cache isolation", () => {
  it("keeps identity but drops protected queries before a different account loads", async () => {
    const client = new QueryClient();
    client.setQueryData(me, null);
    client.setQueryData(orders, { items: ["another account's order"] });
    client.setQueryData([["dashboard", "access"], { type: "query" }], { isLeader: true });
    await clearAccountQueries(client);
    expect(client.getQueryData(me)).toBeNull();
    expect(client.getQueryData(orders)).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    client.clear();
  });
  it("cancels late old-account responses so they cannot refill the cleared cache", async () => {
    const client = new QueryClient();
    let complete!: (value: unknown) => void;
    const pending = client.fetchQuery({ queryKey: orders, queryFn: () => new Promise(resolve => { complete = resolve; }) }).catch(() => null);
    await clearAccountQueries(client);
    complete({ items: ["old response"] });
    await pending;
    expect(client.getQueryData(orders)).toBeUndefined();
    client.clear();
  });
});
