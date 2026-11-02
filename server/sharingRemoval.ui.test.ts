import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ sharing: {} as any, group: {} as any, groups: [] as any[], staff: [] as any[] }));
vi.mock("wouter", () => ({ useLocation: () => ["/groups/44", vi.fn()], useRoute: () => [true, { id: "44" }] }));
vi.mock("../client/src/components/ui/dialog", () => ({ useDialogComposition: () => null, ...Object.fromEntries(["Dialog", "DialogContent", "DialogHeader", "DialogFooter", "DialogTrigger", "DialogTitle", "DialogDescription"].map(name => [name, ({ children }: any) => React.createElement("div", {}, children)])) }));
vi.mock("../client/src/components/ui/alert-dialog", () => Object.fromEntries(["AlertDialog", "AlertDialogContent", "AlertDialogHeader", "AlertDialogFooter", "AlertDialogTitle", "AlertDialogDescription", "AlertDialogCancel", "AlertDialogAction"].map(name => [name, ({ children }: any) => React.createElement("div", {}, children)])));
vi.mock("../client/src/lib/trpc", () => {
  const query = (data: any) => ({ data, isLoading: false, isError: false, refetch: vi.fn() });
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  const leaf = { invalidate: vi.fn() };
  return { trpc: { useUtils: () => ({ groups: leaf, leads: leaf, dashboard: leaf }), leads: { assignees: { useQuery: () => query(state.staff) } }, groups: { get: { useQuery: () => query(state.group) }, list: { useQuery: () => query(state.groups) }, leadSharing: { useQuery: () => query(state.sharing) }, ...Object.fromEntries(["shareGroup", "unshareGroup", "shareLead", "unshareLead", "addLead", "removeLead", "update", "remove"].map(name => [name, { useMutation: mutation }])) } } };
});
import { LeadAccessDialog } from "../client/src/components/crm/LeadAccessDialog";
import { GroupDetail } from "../client/src/pages/LeadGroups";
const renderLead = () => renderToStaticMarkup(React.createElement(LeadAccessDialog, { leadId: 101, ownerId: 17, staff: state.staff }));
const renderGroup = () => renderToStaticMarkup(React.createElement(GroupDetail, { id: 44 }));
beforeEach(() => {
  vi.stubGlobal("React", React); vi.clearAllMocks();
  state.staff = [{ id: 17, name: "Owner", email: "owner@example.invalid" }, { id: 18, name: "Shared person with a very long name", email: "recipient-with-a-very-long-identity@example.invalid" }];
  state.groups = [{ id: 44, name: "Shared group", canManage: false, canManageSharing: true, canManageMembership: true }];
  state.sharing = { canManage: true, shares: [{ id: 9, userId: 18, name: "Shared person", email: "recipient@example.invalid" }], groups: [{ id: 44, name: "Shared group", ownerId: 17, canRemove: true }] };
  state.group = { group: { id: 44, name: "Shared group", ownerId: 17, description: null }, ownerName: "Owner", canManage: false, canManageSharing: true, canManageMembership: true, members: [{ lead: { id: 101, firstName: "Fake", lastName: "Lead", stateCode: "FL", diagnosisCategory: "oncology", status: "verified" } }], shares: state.sharing.shares };
});
describe("Sharing removal UI", () => {
  it("shows explicit direct and membership removal with preservation and independent access warnings", () => {
    const html = renderLead();
    expect(html).toContain("Remove direct access"); expect(html).toContain("Remove from group"); expect(html).toContain("Shared person"); expect(html).toContain("ownership, assignment"); expect(html).toContain("documents"); expect(html).toContain("Manage group sharing");
  });
  it("does not offer a recipient revoke or reshare controls for a foreign lead", () => {
    state.sharing.canManage = false; state.sharing.groups[0].canRemove = false; state.groups = [];
    expect(renderLead()).toBe("");
  });
  it("can remove a membership independently without direct-share administration", () => {
    state.sharing.canManage = false;
    const html = renderLead(); expect(html).toContain("Remove from group"); expect(html).not.toContain("Remove direct access");
  });
  it("allows a Leader sharing removal but not whole-group edit/deletion", () => {
    const html = renderGroup(); expect(html).toContain("Remove group access"); expect(html).toContain("Remove from group"); expect(html).toContain("Share group"); expect(html).not.toContain("Edit group"); expect(html).not.toContain("Remove “Shared group”?");
  });
  it("preserves membership permission independently from sharing permission", () => {
    state.group.canManageMembership = false;
    const html = renderGroup(); expect(html).toContain("Remove group access"); expect(html).not.toContain("Remove from group");
  });
  it("hides mutation controls for an ordinary group recipient", () => {
    state.group.canManageSharing = false; state.group.canManageMembership = false;
    const buttons = (renderGroup().match(/<button\b[\s\S]*?<\/button>/g) ?? []).join(" ");
    expect(buttons).not.toContain("Remove group access"); expect(buttons).not.toContain("Remove from group"); expect(buttons).not.toContain("Share group");
  });
  it("keeps Super Admin whole-group controls separate from sharing removal", () => {
    state.group.canManage = true;
    const html = renderGroup(); expect(html).toContain("Edit group"); expect(html).toContain("Remove “Shared group”?"); expect(html).toContain("Remove group access");
  });
  it("shows current empty direct sharing without suggesting all access was removed", () => {
    state.sharing.shares = [];
    const html = renderLead(); expect(html).toContain("No direct staff shares"); expect(html).toContain("shared groups"); expect(html).toContain("Leader role remains");
  });
});
