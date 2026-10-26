import type { QueryClient, QueryKey } from "@tanstack/react-query";

function isIdentityQuery(key: QueryKey): boolean {
  const route = key[0];
  return Array.isArray(route) && route.length === 2 && route[0] === "auth" && route[1] === "me";
}

/** Keep the mounted identity observer, but discard every prior-account data query. */
export async function clearAccountQueries(client: QueryClient): Promise<void> {
  const filters = { predicate: (query: { queryKey: QueryKey }) => !isIdentityQuery(query.queryKey) };
  await client.cancelQueries(filters);
  client.removeQueries(filters);
}
