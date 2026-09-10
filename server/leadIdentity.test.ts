import { describe, expect, it } from "vitest";
import { buildLeadIdentityKeys, identityMatchLabels, normalizeEmail, normalizePhone } from "./leadIdentity";
import { communicationLeadUpdate, mergeLeadPatch } from "./leadWorkflow";

describe("lead duplicate identities", () => {
  it("normalizes email casing and whitespace", () => {
    expect(normalizeEmail("  PERSON@Example.COM ")).toBe("person@example.com");
    expect(buildLeadIdentityKeys({ email: "PERSON@example.com" })[0]?.keyHash)
      .toBe(buildLeadIdentityKeys({ email: "person@EXAMPLE.com" })[0]?.keyHash);
  });

  it("normalizes phone formatting", () => {
    expect(normalizePhone("(754) 399-6093")).toBe("7543996093");
    expect(buildLeadIdentityKeys({ phone: "+1 (754) 399-6093" })[0]?.keyHash)
      .toBe(buildLeadIdentityKeys({ phone: "754-399-6093" })[0]?.keyHash);
  });

  it("matches a strong name and date-of-birth profile while avoiding weak name-only keys", () => {
    const first = buildLeadIdentityKeys({ firstName: "José", lastName: "Stone", dateOfBirth: "1980-05-02" });
    const second = buildLeadIdentityKeys({ firstName: "jose", lastName: " STONE ", dateOfBirth: "May 2, 1980" });
    expect(first.find(key => key.keyType === "profile")?.keyHash).toBe(second.find(key => key.keyType === "profile")?.keyHash);
    expect(identityMatchLabels(first, { firstName: "José", lastName: "Stone", dateOfBirth: "1980-05-02" })).toContain("first name + last name + date of birth");
    expect(first.find(key => key.keyType === "profile")?.keyHash).not.toBe(buildLeadIdentityKeys({ firstName: "Jose", lastName: "Stone", dateOfBirth: "1981-05-02" }).find(key => key.keyType === "profile")?.keyHash);
    expect(buildLeadIdentityKeys({ firstName: "John", lastName: "Smith" })).toHaveLength(0);
  });
});

describe("explicit status workflow", () => {
  it("keeps business status and interest signal independent", () => {
    const current = { status: "verified", interestLevel: "warm", firstName: "Ana", lastName: "Stone" } as any;
    expect(mergeLeadPatch(current, { status: "qualified" } as any)).toMatchObject({ status: "qualified", interestLevel: "warm" });
    expect(mergeLeadPatch(current, { interestLevel: "hot" } as any)).toMatchObject({ status: "verified", interestLevel: "hot" });
  });

  it("records contact time without changing status", () => {
    const update = communicationLeadUpdate({ contactedAt: 1234 });
    expect(update).toEqual({ lastContactAt: 1234 });
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("nextFollowUpAt");
  });

  it("sets a new reminder without changing status", () => {
    const update = communicationLeadUpdate({ contactedAt: 1234, nextFollowUpAt: 5678 });
    expect(update).toEqual({ lastContactAt: 1234, nextFollowUpAt: 5678 });
    expect(update).not.toHaveProperty("status");
  });

  it("completes and clears a reminder without changing status", () => {
    const update = communicationLeadUpdate({ contactedAt: 1234, nextFollowUpAt: null, clearFollowUp: true });
    expect(update).toEqual({ lastContactAt: 1234, nextFollowUpAt: null });
    expect(update).not.toHaveProperty("status");
    expect(update).not.toHaveProperty("interestLevel");
  });
});
