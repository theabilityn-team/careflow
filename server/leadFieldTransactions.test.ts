import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as any[][], writes: [] as any[], locks: 0, transactions: 0 }));
vi.mock("drizzle-orm/mysql2", () => {
  const tx = {
    select: () => { const result = state.rows.shift() ?? []; const chain: any = { from: () => chain, innerJoin: () => chain, leftJoin: () => chain, where: () => chain, limit: () => chain, for: () => { state.locks++; return Promise.resolve(result); } }; return chain; },
    update: () => ({ set: (value: unknown) => { state.writes.push(value); return { where: () => Promise.resolve() }; } }),
    insert: () => ({ values: () => Promise.resolve() }),
    delete: () => ({ where: () => Promise.resolve() }),
  };
  return { drizzle: () => ({ ...tx, transaction: async (callback: (transaction: any) => unknown) => { state.transactions++; return callback(tx); } }) };
});
import { updateStaffAccess, updateStaffLeadFields } from "./db";
import { LEAD_FIELD_KEYS } from "../shared/leadFieldPermissions";
const actor = { id: 17, role: "user", loginMethod: "local", isActive: true, deletedAt: null, permissions: JSON.stringify({ manageSales: true }) };
const target = { id: 18, role: "user", loginMethod: "local", isActive: true, deletedAt: null, permissions: JSON.stringify({ manageSales: false, viewClinical: false, customSavedSetting: "keep", leadFields: { email: "hide", phone: "view" } }) };
beforeEach(() => { vi.stubEnv("DATABASE_URL", "mysql://fixture.invalid/never-connected"); state.rows = []; state.writes = []; state.locks = 0; state.transactions = 0; });
afterEach(() => vi.unstubAllEnvs());
describe("no-network staff field transactions", () => {
  it("merges only requested fields under actor/target locks and preserves master false plus unrelated fields", async () => {
    state.rows = [[actor], [target]];
    const result = await updateStaffLeadFields({ userId: 18, leadFields: { address: "view" }, actorId: 17, actorIsSuperAdmin: false });
    expect(result.kind).toBe("updated"); expect(state.locks).toBe(2); expect(state.transactions).toBe(1);
    const saved = JSON.parse(state.writes[0].permissions);
    expect(saved).toEqual({ manageSales: false, viewClinical: false, customSavedSetting: "keep", leadFields: { email: "hide", phone: "view", address: "view" } });
  });
  it.each([
    [{ ...actor, isActive: false }, target],
    [{ ...actor, permissions: JSON.stringify({ manageSales: false }) }, target],
    [actor, { ...target, id: 17 }],
    [actor, { ...target, isActive: false, permissions: JSON.stringify({ manageSales: true }) }],
  ])("rejects fresh inactive/ordinary actors, self changes and other Leader targets without writes", async (freshActor, freshTarget) => {
    state.rows = [[freshActor], [freshTarget]];
    const result = await updateStaffLeadFields({ userId: freshTarget.id, leadFields: { email: "edit" }, actorId: 17, actorIsSuperAdmin: false });
    expect(result.kind).toBe("forbidden"); expect(state.writes).toEqual([]);
  });
  it.each([null, "invalid", [], { email: "invalid" }, { noSuchField: "edit" }])("never promotes a malformed persisted map into default Edit on partial save", async leadFields => {
    state.rows = [[], [{ ...target, permissions: JSON.stringify({ manageSales: false, leadFields }) }]];
    const result = await updateStaffLeadFields({ userId: 18, leadFields: { email: "view" }, actorId: -1, actorIsSuperAdmin: true });
    expect(result.kind).toBe("conflict"); expect(state.writes).toEqual([]);
  });
  it("allows Super Admin to manage a Leader target even without a stored synthetic admin user", async () => {
    state.rows = [[], [{ ...target, permissions: JSON.stringify({ manageSales: true, leadFields: { email: "hide" } }) }]];
    const result = await updateStaffLeadFields({ userId: 18, leadFields: { phone: "view" }, actorId: -1, actorIsSuperAdmin: true });
    expect(result.kind).toBe("updated"); expect(JSON.parse(state.writes[0].permissions).manageSales).toBe(true);
  });
  it("general staff permission updates retain the saved granular map rather than overwriting its JSON", async () => {
    state.rows = [[{ id: 18, role: "user", loginMethod: "local" }], [{ userId: 18 }], [target], [target]];
    expect(await updateStaffAccess({ userId: 18, jobTitle: "Updated title", isActive: true, permissions: JSON.stringify({ viewLeads: true, editLeads: true }), actorId: -1 })).toBe(true);
    expect(state.locks).toBe(4);
    const saved = JSON.parse(state.writes[0].permissions);
    expect(saved.leadFields).toEqual({ email: "hide", phone: "view" }); expect(saved.customSavedSetting).toBe("keep");
  });
  it("repairing wholly malformed general permission JSON retains fail-closed field access", async () => {
    const corrupt = { ...target, permissions: "invalid JSON" };
    state.rows = [[{ id: 18, role: "user", loginMethod: "local" }], [{ userId: 18 }], [corrupt], [corrupt]];
    await updateStaffAccess({ userId: 18, jobTitle: "Updated title", isActive: true, permissions: JSON.stringify({ viewLeads: true, editLeads: true }), actorId: -1 });
    const saved = JSON.parse(state.writes[0].permissions);
    expect(Object.keys(saved.leadFields)).toEqual(LEAD_FIELD_KEYS); expect(Object.values(saved.leadFields).every(mode => mode === "hide")).toBe(true);
  });
});
