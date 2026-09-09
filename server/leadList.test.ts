import { describe, expect, it } from "vitest";
import { normalizeLeadPagination } from "./leadList";

describe("lead list pagination", () => {
  it("calculates pages and offsets", () => {
    expect(normalizeLeadPagination(126, 3, 25)).toEqual({ total: 126, page: 3, pageSize: 25, totalPages: 6, offset: 50 });
  });

  it("clamps a page after filters reduce the result count", () => {
    expect(normalizeLeadPagination(12, 9, 25)).toMatchObject({ page: 1, totalPages: 1, offset: 0 });
  });

  it("keeps empty results on a valid first page", () => {
    expect(normalizeLeadPagination(0, 1, 25)).toEqual({ total: 0, page: 1, pageSize: 25, totalPages: 1, offset: 0 });
  });

  it("enforces safe page-size bounds", () => {
    expect(normalizeLeadPagination(1000, 1, 1).pageSize).toBe(10);
    expect(normalizeLeadPagination(1000, 1, 1000).pageSize).toBe(100);
  });
});
