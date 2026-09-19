import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

function adminContext(): TrpcContext {
  const now = new Date();
  return {
    user: { id: -1000000, openId: "system:super-admin", name: "Super Administrator", email: "admin@admin.com", loginMethod: "local", role: "admin", createdAt: now, updatedAt: now, lastSignedIn: now },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const active = {
  id: 91,
  leadId: 17,
  sourceCommunicationId: 201,
  recipientUserId: 33,
  createdBy: 33,
  scheduledFor: 1_789_833_600_000,
  remindAt: 1_789_826_400_000,
  readAt: null,
  staffEmailStatus: "pending" as const,
  leadEmailStatus: "pending" as const,
  staffSentAt: null,
  leadSentAt: null,
  lastError: null,
  attempts: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

afterEach(() => vi.restoreAllMocks());

describe("independent follow-up lifecycle", () => {
  it("edits the selected follow-up ID through the authorized API", async () => {
    vi.spyOn(db, "getActiveFollowUp").mockResolvedValue(active);
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    const update = vi.spyOn(db, "updateActiveFollowUp").mockResolvedValue({ leadId: 17 });

    const result = await appRouter.createCaller(adminContext()).dashboard.updateFollowUp({ id: 91, scheduledFor: 1_789_837_200_000 });

    expect(result).toEqual({ success: true, leadId: 17 });
    expect(update).toHaveBeenCalledWith({ id: 91, scheduledFor: 1_789_837_200_000, actorId: -1000000 });
  });

  it("deletes only the selected follow-up ID through the authorized API", async () => {
    vi.spyOn(db, "getActiveFollowUp").mockResolvedValue(active);
    vi.spyOn(db, "canAccessLead").mockResolvedValue(true);
    const remove = vi.spyOn(db, "deleteActiveFollowUp").mockResolvedValue({ leadId: 17 });

    const result = await appRouter.createCaller(adminContext()).dashboard.deleteFollowUp({ id: 91 });

    expect(result).toEqual({ success: true, leadId: 17 });
    expect(remove).toHaveBeenCalledWith({ id: 91, actorId: -1000000 });
  });

  it("does not reveal or mutate a follow-up outside the viewer's accessible leads", async () => {
    vi.spyOn(db, "getActiveFollowUp").mockResolvedValue(active);
    vi.spyOn(db, "canAccessLead").mockResolvedValue(false);
    const update = vi.spyOn(db, "updateActiveFollowUp");

    await expect(appRouter.createCaller(adminContext()).dashboard.updateFollowUp({ id: 91, scheduledFor: 1_789_837_200_000 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(update).not.toHaveBeenCalled();
  });
});
