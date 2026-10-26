import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: { id: 20, name: "Staff", impersonation: { actor: { id: 10, name: "Leader", email: "actor@example.invalid" }, target: { id: 20, name: "Staff", email: "target@example.invalid" }, expiresAt: 2_000_000_000_000 } } as any }));
vi.mock("../client/src/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("../client/src/lib/trpc", () => ({ trpc: { impersonation: { start: { useMutation: () => ({ isPending: false }) }, stop: { useMutation: () => ({ isPending: false }) }, targets: { useQuery: () => ({ data: [{ id: 20, name: "Ordinary Staff", email: "staff@example.invalid", jobTitle: "Technical Staff" }], isLoading: false }) } } } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));
import { ImpersonationBanner, ImpersonationDirectory, ImpersonateButton } from "../client/src/components/crm/Impersonation";
import { impersonationInfo, workspaceIdentity } from "../client/src/lib/impersonation";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());
describe("impersonation UI safeguards", () => {
  it("shows a prominent original-actor banner and return action, and prevents nested selection", () => {
    const html = renderToStaticMarkup(React.createElement(ImpersonationBanner));
    expect(html).toContain("Impersonating: Staff");
    expect(html).toContain("Signed in by Leader");
    expect(html).toContain("Return to my account");
    expect(renderToStaticMarkup(React.createElement(ImpersonateButton, { member: { id: 30, name: "Other", email: "other@example.invalid" } }))).toBe("");
  });
  it("gives Leader only the minimal directory, with no account/password/permission editing", () => {
    state.user = { id: 10, name: "Leader" };
    const html = renderToStaticMarkup(React.createElement(ImpersonationDirectory));
    expect(html).toContain("Ordinary Staff");
    expect(html).toContain("Impersonate");
    expect(html).not.toContain("Create account");
    expect(html).not.toContain("Change password");
    expect(html).not.toContain("Save access");
  });
  it("identifies workspaces without storing session credentials or merging original permissions", () => {
    expect(workspaceIdentity({ id: 20 })).toBe("20:0");
    expect(workspaceIdentity({ id: 20, impersonation: { actor: { id: 10 }, target: { id: 20 }, expiresAt: 1 } })).toBe("20:10");
    expect(workspaceIdentity(null)).toBeUndefined();
    expect(impersonationInfo({ id: 20 })).toBeNull();
  });
});
