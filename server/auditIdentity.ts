import { AsyncLocalStorage } from "node:async_hooks";

export type AuditIdentity = { actorId: number; actorName: string; targetId: number; targetName: string };
const identities = new AsyncLocalStorage<AuditIdentity | undefined>();

export function runWithAuditIdentity<T>(identity: AuditIdentity | undefined, callback: () => T): T {
  return identities.run(identity, callback);
}

/** Existing effective actor fields stay intact; the original operator is appended server-side. */
export function enrichAuditValues<T extends Record<string, unknown> | Record<string, unknown>[]>(values: T): T {
  const identity = identities.getStore();
  const provenance = { impersonatedById: identity?.actorId ?? null, impersonatedByName: identity?.actorName.slice(0, 160) ?? null };
  return (Array.isArray(values) ? values.map(value => ({ ...value, ...provenance })) : { ...values, ...provenance }) as T;
}
