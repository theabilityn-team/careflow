import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmailTemplates from "../client/src/pages/EmailTemplates";

const state = vi.hoisted(() => ({
  access: { role: "technical_staff", isActive: true, permissions: { manageEmails: true, useEmailTemplates: true } },
  library: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    dashboard: { access: { useQuery: () => ({ data: state.access, isLoading: false }) } },
    emailLibrary: { library: { useQuery: state.library } },
  },
}));

afterEach(() => {
  state.access = { role: "technical_staff", isActive: true, permissions: { manageEmails: true, useEmailTemplates: true } };
  state.library.mockClear();
});

describe("staff email templates route", () => {
  it("renders the read-only library for active Technical Staff with both permissions", () => {
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(React.createElement(EmailTemplates));

    expect(html).toContain("Read-only approved templates");
    expect(html).toContain("Open Mails");
    expect(html).not.toContain("Add product");
    expect(html).not.toContain("Copy product");
    expect(html).not.toContain("Send test");
    expect(html).not.toContain("SMTP");
    expect(state.library).toHaveBeenCalledWith(undefined, { enabled: true, refetchOnMount: "always" });
  });

  it.each([
    ["missing manageEmails", { manageEmails: false, useEmailTemplates: true }],
    ["missing useEmailTemplates", { manageEmails: true, useEmailTemplates: false }],
    ["missing both permissions", { manageEmails: false, useEmailTemplates: false }],
  ])("denies staff access when %s", (_label, permissions) => {
    state.access = { role: "technical_staff", isActive: true, permissions };
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(React.createElement(EmailTemplates));

    expect(html).toContain("Email templates unavailable");
    expect(html).not.toContain("Read-only approved templates");
    expect(state.library).toHaveBeenCalledWith(undefined, { enabled: false, refetchOnMount: "always" });
  });

  it("denies inactive staff even when both email permissions are enabled", () => {
    state.access = { role: "technical_staff", isActive: false, permissions: { manageEmails: true, useEmailTemplates: true } };
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(React.createElement(EmailTemplates));

    expect(html).toContain("Email templates unavailable");
    expect(state.library).toHaveBeenCalledWith(undefined, { enabled: false, refetchOnMount: "always" });
  });
});
