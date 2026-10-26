import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import EmailSettings from "../client/src/pages/EmailSettings";

const queries = vi.hoisted(() => ({
  accounts: vi.fn(() => ({ data: [], isLoading: false })),
  settings: vi.fn(() => ({ data: undefined, isLoading: false })),
  templates: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({}),
    dashboard: { access: { useQuery: () => ({ data: { role: "technical_staff", isActive: true, permissions: { manageEmails: true, useEmailTemplates: true } }, isLoading: false }) } },
    emailSettings: {
      managedAccounts: { useQuery: queries.accounts },
      get: { useQuery: queries.settings },
      testEmailTemplates: { useQuery: queries.templates },
      save: { useMutation: () => ({}) },
      testConnection: { useMutation: () => ({}) },
      sendTestEmail: { useMutation: () => ({}) },
    },
  },
}));

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("staff direct Email settings route", () => {
  it("shows a denial without SMTP fields, test actions, or enabled setup queries even with both email permissions", () => {
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(React.createElement(EmailSettings));
    expect(html).toContain("Email settings unavailable");
    expect(html).toContain("Only Super Admin configures and tests SMTP accounts.");
    expect(html).not.toContain("SMTP host");
    expect(html).not.toContain("SMTP password");
    expect(html).not.toContain("Test connection");
    expect(html).not.toContain("Save settings");
    expect(queries.accounts).toHaveBeenCalledWith(undefined, { enabled: false });
    expect(queries.settings).toHaveBeenCalledWith({}, { enabled: false });
    expect(queries.templates).toHaveBeenCalledWith({}, { enabled: false });
  });
});
