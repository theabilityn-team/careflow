import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./staffDeletion", async importOriginal => {
 const original = await importOriginal<typeof import("./staffDeletion")>();
 return { ...original, deleteStaffAccount: vi.fn() };
});
import { staffRouter } from "./routers/staff";
import { deleteStaffAccount, StaffDeletionError } from "./staffDeletion";
const user = (role: "admin" | "user") => ({ id: 11, openId: "qa", name: "QA", email: "qa@example.invalid", role, loginMethod: "local", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
const caller = (role: "admin" | "user") => staffRouter.createCaller({ user: user(role), req: { headers: {} }, res: {} } as any);
describe("staff delete API", () => {
 beforeEach(() => { vi.mocked(deleteStaffAccount).mockReset(); });

 it("allows Super Admin and preserves exact actor provenance", async () => { vi.mocked(deleteStaffAccount).mockResolvedValue({ success: true, userId: 22, deletedAt: 100 }); expect(await caller("admin").deleteAccount({ userId: 22 })).toEqual({ success: true, userId: 22, deletedAt: 100 }); expect(deleteStaffAccount).toHaveBeenCalledWith({ userId: 22, actorId: 11 }); });
 it("denies ordinary staff and Leaders before mutation", async () => { await expect(caller("user").deleteAccount({ userId: 22 })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(deleteStaffAccount).not.toHaveBeenCalled(); });
 it("maps self/admin/deleted safety errors without changing records", async () => { vi.mocked(deleteStaffAccount).mockRejectedValue(new StaffDeletionError("SELF_DELETE", "You cannot delete your own staff account.")); const error = await caller("admin").deleteAccount({ userId: 11 }).catch(e => e); expect({ code: error.code, message: error.message }).toMatchObject({ code: "BAD_REQUEST" }); });
 it("never exposes raw database/credential errors", async () => { vi.mocked(deleteStaffAccount).mockRejectedValue(new Error("SQL passwordHash=CANARY_SECRET")); const error = await caller("admin").deleteAccount({ userId: 22 }).catch(e => e); expect({ code: error.code, message: error.message }).toEqual({ code: "INTERNAL_SERVER_ERROR", message: "The staff account could not be deleted. Please try again." }); });
});
