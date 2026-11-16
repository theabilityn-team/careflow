import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const access = { role: "technical_staff", isActive: true, isLeader: false, permissions: {} };
  const staffQuery = vi.fn(() => ({ data: [], isLoading: false, isFetching: false, error: null, refetch: vi.fn() }));
  const settingsQuery = vi.fn(() => ({ data: { inactivityMinutes: 40, trackingSince: null }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }));
  const reportQuery = vi.fn(() => ({ data: undefined, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }));
  return { access, user: null as any, staffQuery, settingsQuery, reportQuery };
});

vi.mock("../client/src/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../client/src/lib/impersonation", async importOriginal => {
  const actual = await importOriginal<typeof import("../client/src/lib/impersonation")>();
  return { ...actual, impersonationInfo: (user: any) => user?.impersonation ?? null };
});
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    dashboard: { access: { useQuery: () => ({ data: mocks.access, isLoading: false, error: null }) } },
    measure: {
      staff: { useQuery: mocks.staffQuery },
      settings: { useQuery: mocks.settingsQuery },
      report: { useQuery: mocks.reportQuery },
      saveSettings: { useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }) },
    },
  },
}));

import Measure from "../client/src/pages/Measure";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  mocks.user = { id: 21, name: "Staff" };
  Object.assign(mocks.access, { role: "technical_staff", isActive: true, isLeader: false });
});
afterEach(() => vi.unstubAllGlobals());

describe("Measure screen access and transport safeguards", () => {
  it("denies ordinary active staff before enabling Measure queries", () => {
    const html = renderToStaticMarkup(React.createElement(Measure));
    expect(html).toContain("Measure is unavailable");
    expect(html).toContain("only to active Leaders and Super Admins");
    expect(mocks.staffQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false, refetchInterval: false }));
    expect(mocks.settingsQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false, refetchOnWindowFocus: false, refetchOnReconnect: false }));
    expect(mocks.reportQuery).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ enabled: false, refetchInterval: false }));
  });

  it("denies Measure while impersonating even when the target has Leader access", () => {
    mocks.access.role = "technical_staff";
    mocks.access.isLeader = true;
    mocks.user = { id: 21, name: "Staff", impersonation: { actor: { id: 1 }, target: { id: 21 }, expiresAt: Date.now() + 60_000 } };
    const html = renderToStaticMarkup(React.createElement(Measure));
    expect(html).toContain("Measure is disabled while impersonating another workspace");
    expect(mocks.staffQuery).toHaveBeenCalledWith(undefined, expect.objectContaining({ enabled: false }));
  });

  it("renders Leader controls and keeps report queries deliberate", () => {
    mocks.access.role = "technical_staff";
    mocks.access.isLeader = true;
    mocks.staffQuery.mockReturnValue({ data: [{ id: 7, name: "A very long staff member name", email: "long-name@example.invalid", isActive: true, isLeader: false }], isLoading: false, isFetching: false, error: null, refetch: vi.fn() } as any);
    mocks.reportQuery.mockReturnValue({ data: undefined, isLoading: false, isFetching: false, error: null, refetch: vi.fn() } as any);
    const html = renderToStaticMarkup(React.createElement(Measure));
    expect(html).toContain("Measure");
    expect(html).toContain("long-name@example.invalid");
    expect(html).toContain("Day");
    expect(html).toContain("Week");
    expect(html).toContain("Month");
    expect(html).toContain("Reports cover up to 366 Eastern calendar days");
    expect(html).toContain("Read-only");
    expect(html).not.toContain('id="measure-threshold" type="number"');
    const reportOptions = mocks.reportQuery.mock.calls[0]?.[1];
    expect(reportOptions).toMatchObject({ refetchInterval: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  });
});

describe("Simplified activity-based Measure", () => {
  it("defaults to the fixed reporting baseline and shows only activity measures", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-16T18:00:00Z"));
    try {
      Object.assign(mocks.access, { role: "super_admin", isLeader: true });
      mocks.staffQuery.mockReturnValue({ data: [{ id: 7, name: "QA Staff", email: "qa@example.invalid", isActive: true }], isLoading: false, isFetching: false, error: null, refetch: vi.fn() } as any);
      const html = renderToStaticMarkup(React.createElement(Measure));
      expect(html).toContain('min="2026-11-15"');
      expect(mocks.reportQuery).toHaveBeenCalledWith(expect.objectContaining({ fromDate: "2026-11-15", toDate: "2026-11-16" }), expect.anything());
      expect(html).toContain("Login is not activity");
      expect(html).not.toContain("Global inactivity threshold");
    } finally { vi.useRealTimers(); }
  });
  it("renders no-activity zero durations without login, credit or impersonation panels", () => {
    Object.assign(mocks.access, { role: "super_admin", isLeader: true });
    mocks.staffQuery.mockReturnValue({ data: [{ id: 7, name: "QA Staff", email: "qa@example.invalid", isActive: true }], isLoading: false, isFetching: false, error: null, refetch: vi.fn() } as any);
    const totals = { leadOpens: 0, leadWorkSamples: 0, statusChanges: 0, contactsLogged: 0, emailsSent: 0, ordersEntered: 0, activeMinutes: 0, inactiveMinutes: 0, averageLeadMinutes: null };
    mocks.reportQuery.mockReturnValue({ data: { totals, points: [], inactivePeriods: [], inactivePeriodsTotal: 0, updatedThrough: Date.now(), inactivityMinutes: 40 }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() } as any);
    const html = renderToStaticMarkup(React.createElement(Measure));
    for (const label of ["No activity", "Completed lead work", "Successful emails", "Orders entered", "Average lead work"]) expect(html).toContain(label);
    for (const label of ["First login", "First activity", "Last activity", "Orders credited", "Impersonation activity", "How to read Measure"]) expect(html).not.toContain(label);
    expect(html).not.toContain("<table");
    expect(html.match(/>0 min</g)).toHaveLength(2);
  });
});
