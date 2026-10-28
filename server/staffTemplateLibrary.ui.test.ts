import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmailTemplates from "../client/src/pages/EmailTemplates";
import { SYSTEM_ADMIN_ACTOR_ID } from "../shared/const";
const state = vi.hoisted(() => ({
  access: { role: "technical_staff", isActive: true, permissions: { manageEmails: true, useEmailTemplates: true } },
  library: vi.fn<() => any>(() => ({ data: [], isLoading: false, isError: false })),
  mutation: vi.fn(() => ({ isPending: false, mutateAsync: vi.fn() })),
}));
vi.mock("../client/src/lib/trpc", () => ({ trpc: {
 useUtils: () => ({ emailLibrary: { invalidate: async () => undefined } }),
 dashboard: { access: { useQuery: () => ({ data: state.access, isLoading: false }) } },
 emailLibrary: { personalLibrary: { useQuery: state.library }, createPersonalTemplate: { useMutation: state.mutation }, updatePersonalTemplate: { useMutation: state.mutation }, deletePersonalTemplate: { useMutation: state.mutation } },
} }));
afterEach(() => { state.access = { role: "technical_staff", isActive: true, permissions: { manageEmails: true, useEmailTemplates: true } };state.library.mockReset().mockImplementation(() => ({ data: [], isLoading: false, isError: false }));state.mutation.mockClear(); });
const render = () => { vi.stubGlobal("React", React); return renderToStaticMarkup(React.createElement(EmailTemplates)); };
const template = (id: number, ownerUserId: number, isActive = true) => ({ id, ownerUserId, ownerName: "Staff", productId: 1, name: `Template ${id}`, description: "", subject: "Subject", contentMode: "plain", bodyText: "Hello", bodyHtml: null, sourceFileName: null, isActive, sortOrder: 0 });
describe("staff default and personal template library", () => {
 it("renders workspace, visible URL tracking warning, and no product/admin controls", () => { const html=render();expect(html).toContain("Defaults stay unchanged");expect(html).toContain("Keep tracking codes in links");expect(html).toContain("Do not delete or change");expect(html).toContain("Open Mails");expect(html).not.toContain("Add product");expect(html).not.toContain("Send test");expect(state.library).toHaveBeenCalledWith(undefined,{refetchOnMount:"always"}); });
 it.each([["Emails",{manageEmails:false,useEmailTemplates:true}],["templates",{manageEmails:true,useEmailTemplates:false}],["both",{manageEmails:false,useEmailTemplates:false}]])("denies %s-off without loading templates or mutation hooks", (_label,permissions)=>{state.access={role:"technical_staff",isActive:true,permissions};expect(render()).toContain("Email templates unavailable");expect(state.library).not.toHaveBeenCalled();expect(state.mutation).not.toHaveBeenCalled();});
 it("denies inactive staff without template queries",()=>{state.access.isActive=false;expect(render()).toContain("Email templates unavailable");expect(state.library).not.toHaveBeenCalled();});
 it("defaults have copy/preview only; personal templates have own edit/archive/delete",()=>{state.library.mockReturnValue({data:[{id:1,name:"Product",description:"",isActive:true,templates:[template(1,SYSTEM_ADMIN_ACTOR_ID),template(2,42),template(3,42,false)]}],isLoading:false,isError:false});const html=render();const start=html.indexOf(">Default templates</h3>");const end=html.indexOf(">My templates</h3>");const defaults=html.slice(start,end);const mine=html.slice(end);expect(html).toContain("Add my template");expect(defaults).toContain("Default · read-only");expect(defaults).toContain("Copy to my templates");expect(defaults).not.toContain("Edit my template");expect(defaults).not.toContain("Delete my template");expect(mine).toContain("Edit my template");expect(mine).toContain("Delete my template");expect(mine).toContain("Archived");expect(mine).toContain("Activate");});
 it("error state does not render stale private content",()=>{state.library.mockReturnValue({data:[{id:1,name:"Stale private canary",templates:[]}],isLoading:false,isError:true});const html=render();expect(html).toContain("Templates could not be loaded");expect(html).not.toContain("Stale private canary");});
});
