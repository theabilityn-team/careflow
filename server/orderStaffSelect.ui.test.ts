import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrderStaffSelect, { StaffIdentity } from "../client/src/components/crm/OrderStaffSelect";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
const owners = [{ userId: 21, name: "A very long staff account name", email: "long.staff.account@example.invalid", isActive: true, isSuperAdmin: false }];

describe("readable order staff selectors", () => {
  it("renders the selected staff name and email without one-line truncation", () => {
    const html = renderToStaticMarkup(React.createElement(OrderStaffSelect, { value: "21", onValueChange: vi.fn(), owners }));
    expect(html).toContain(owners[0].name);
    expect(html).toContain(owners[0].email);
    expect(html).toContain("line-clamp-none");
    expect(html).toContain("min-h-14");
    expect(html).toContain('aria-label="Credited owner"');
  });
  it("preserves Me and All credited owners modes", () => {
    const me = renderToStaticMarkup(React.createElement(OrderStaffSelect, { value: "actor", onValueChange: vi.fn(), owners, includeMe: true, actor: { name: "Test Actor", email: "actor@example.invalid" } }));
    expect(me).toContain("Me (Test Actor)");
    expect(me).toContain("actor@example.invalid");
    const all = renderToStaticMarkup(React.createElement(OrderStaffSelect, { value: "all", onValueChange: vi.fn(), owners, allowAll: true }));
    expect(all).toContain("All credited owners");
  });
  it("renders separate wrapping name/email lines and retains inactive current attribution", () => {
    const label = renderToStaticMarkup(React.createElement(StaffIdentity, { name: owners[0].name, email: owners[0].email }));
    expect(label).toContain("flex-col");
    expect(label).toContain("overflow-wrap:anywhere");
    const html = renderToStaticMarkup(React.createElement(OrderStaffSelect, { value: "21", onValueChange: vi.fn(), owners: [{ ...owners[0], isActive: false }] }));
    expect(html).toContain("Inactive (current owner)");
  });
});
