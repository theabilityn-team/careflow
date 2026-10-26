import { describe, expect, it } from "vitest";
import { enrichAuditValues, runWithAuditIdentity } from "./auditIdentity";

describe("impersonation audit provenance", () => {
  it("keeps the effective actor and records original actor without accepting spoofed provenance", () => {
    const result = runWithAuditIdentity({ actorId: 10, actorName: "Leader", targetId: 20, targetName: "Staff" }, () => enrichAuditValues({ actorId: 20, impersonatedById: 999, detail: "Updated lead" }));
    expect(result).toMatchObject({ actorId: 20, impersonatedById: 10, impersonatedByName: "Leader" });
    expect(enrichAuditValues({ actorId: 20, impersonatedById: 999 })).toMatchObject({ impersonatedById: null, impersonatedByName: null });
  });
  it("preserves independent identities across concurrent awaited requests and array inserts", async () => {
    const actions = [10, 30].map(actorId => runWithAuditIdentity({ actorId, actorName: `Actor ${actorId}`, targetId: 20, targetName: "Staff" }, async () => {
      await new Promise(resolve => setTimeout(resolve, actorId === 10 ? 15 : 1));
      return enrichAuditValues([{ actorId: 20, action: "update" }]);
    }));
    const [first, second] = await Promise.all(actions);
    expect(first[0]).toMatchObject({ actorId: 20, impersonatedById: 10 });
    expect(second[0]).toMatchObject({ actorId: 20, impersonatedById: 30 });
    expect(enrichAuditValues({ actorId: 20 })).toMatchObject({ impersonatedById: null });
  });
});
