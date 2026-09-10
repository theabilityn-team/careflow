import { describe, expect, it } from "vitest";
import { analyzeBulkLeadDuplicates, MAX_BULK_IMAGES, MAX_BULK_LEADS, MAX_IMAGES_PER_LEAD } from "./bulkLeadImport";
import { buildLeadIdentityKeys } from "./leadIdentity";

describe("bulk image import limits", () => {
  it("keeps the batch bounded for sequential extraction", () => {
    expect(MAX_BULK_LEADS).toBe(10);
    expect(MAX_IMAGES_PER_LEAD).toBe(6);
    expect(MAX_BULK_IMAGES).toBe(20);
  });
});

describe("bulk lead duplicate analysis", () => {
  it("finds an existing lead by normalized email and phone", () => {
    const keys = buildLeadIdentityKeys({ email: "person@example.com", phone: "7543996093" });
    const result = analyzeBulkLeadDuplicates(
      [{ email: " PERSON@EXAMPLE.COM ", phone: "+1 (754) 399-6093" }],
      keys.map(key => ({ ...key, leadId: 42, firstName: "Sarah", lastName: "Gooden" })),
    );
    expect(result[0].existing).toMatchObject({ leadId: 42, matchedBy: ["email", "phone"] });
    expect(result[0].duplicateOfIndex).toBeNull();
  });

  it("blocks a later group that duplicates an earlier group", () => {
    const result = analyzeBulkLeadDuplicates([
      { firstName: "Ana", lastName: "Stone", dateOfBirth: "1980-05-02" },
      { firstName: " ANA ", lastName: "STONE", dateOfBirth: "May 2, 1980" },
    ], []);
    expect(result[0].duplicateOfIndex).toBeNull();
    expect(result[1].duplicateOfIndex).toBe(0);
    expect(result[1].duplicateInBatchBy).toContain("first name + last name + date of birth");
  });

  it("does not treat matching names alone as a duplicate", () => {
    const result = analyzeBulkLeadDuplicates([
      { firstName: "John", lastName: "Smith" },
      { firstName: "John", lastName: "Smith" },
    ], []);
    expect(result.every(item => item.duplicateOfIndex === null && item.existing === null)).toBe(true);
  });

  it("keeps different identities independent", () => {
    const result = analyzeBulkLeadDuplicates([
      { email: "one@example.com", phone: "5551112222" },
      { email: "two@example.com", phone: "5553334444" },
    ], []);
    expect(result[1].duplicateOfIndex).toBeNull();
  });
});
