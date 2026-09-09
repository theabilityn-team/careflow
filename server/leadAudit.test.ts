import { describe, expect, it } from "vitest";
import { leadChanges, leadSnapshot, parseAuditJson, prepareAuditEvents, serializeAudit } from "./leadAudit";

describe("lead audit helpers", () => {
  it("captures the complete initial business state", () => {
    const snapshot = leadSnapshot({
      firstName: "Ana",
      lastName: "Stone",
      status: "verified",
      interestLevel: "warm",
      phone: null,
      assignedTo: 7,
    });
    expect(snapshot).toMatchObject({
      firstName: "Ana",
      lastName: "Stone",
      status: "verified",
      interestLevel: "warm",
      phone: null,
      assignedTo: 7,
    });
    expect(Object.keys(snapshot)).toContain("nextFollowUpAt");
  });

  it("records only fields whose normalized values changed", () => {
    const changes = leadChanges(
      { firstName: "Ana", status: "new", phone: null, assignedTo: 2 },
      { firstName: "Ana", status: "contacted", phone: "+1 555 0100", assignedTo: 2 },
    );
    expect(changes).toEqual([
      { field: "phone", before: null, after: "+1 555 0100" },
      { field: "status", before: "new", after: "contacted" },
    ]);
  });

  it("round-trips stored audit JSON and safely handles legacy rows", () => {
    const value = [{ field: "status", before: "new", after: "verified" }];
    expect(parseAuditJson(serializeAudit(value), [])).toEqual(value);
    expect(parseAuditJson("legacy text", [])).toEqual([]);
    expect(parseAuditJson(null, [])).toEqual([]);
  });

  it("redacts clinical fields for staff without clinical access", () => {
    const [event] = prepareAuditEvents([{
      detail: "Updated 2 fields",
      changes: serializeAudit([
        { field: "phone", before: null, after: "+1 555 0100" },
        { field: "diagnosis", before: null, after: "Protected diagnosis" },
      ]),
      snapshotBefore: serializeAudit({ phone: null, diagnosis: null }),
      snapshotAfter: serializeAudit({ phone: "+1 555 0100", diagnosis: "Protected diagnosis" }),
    }], false);
    expect(event.changes).toEqual([{ field: "phone", before: null, after: "+1 555 0100" }]);
    expect(event.snapshotAfter).toEqual({ phone: "+1 555 0100" });
    expect(JSON.stringify(event)).not.toContain("Protected diagnosis");
  });
});
