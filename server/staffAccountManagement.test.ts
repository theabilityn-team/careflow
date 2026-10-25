import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

const now = new Date("2026-09-19T00:00:00Z");
const admin = {
  id: 30_001,
  openId: "system:super-admin",
  name: "Super Administrator",
  email: "admin@admin.com",
  loginMethod: "system",
  role: "admin" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const staff = {
  id: 17,
  openId: "local:staff",
  name: "Technical Staff",
  email: "staff@example.com",
  loginMethod: "local",
  role: "user" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};
const permissions = {
  viewLeads: true,
  createLeads: true,
  editLeads: true,
  scanDocuments: false,
  viewClinical: false,
  manageContacts: true,
  manageEmails: false,
  useEmailTemplates: false,
  changeStatus: true,
  exportData: false,
};

function context(user: typeof admin | typeof staff | null): TrpcContext {
  return { user, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

const createInput = {
  fullName: "  New Staff Member  ",
  email: " New.Staff@Example.COM ",
  password: "ValidPass1",
  jobTitle: "Technical Staff",
  isActive: true,
  permissions,
};

afterEach(() => vi.restoreAllMocks());

describe("staff account-management contracts", () => {
  it("requires Super Admin access and positive numeric target IDs", async () => {
    const create = vi.spyOn(db, "createDirectStaffAccount");
    const edit = vi.spyOn(db, "editStaffAccount");
    const setPassword = vi.spyOn(db, "setStaffAccountPassword");

    await expect(appRouter.createCaller(context(staff)).staff.createAccount(createInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(context(null)).staff.createAccount(createInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const user of [staff, null]) {
      await expect(appRouter.createCaller(context(user)).staff.editAccount({ userId: 17, fullName: "Valid Name", email: "valid@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(appRouter.createCaller(context(user)).staff.setAccountPassword({ userId: 17, password: "ValidPass1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(appRouter.createCaller(context(admin)).staff.editAccount({ userId: 0, fullName: "Valid Name", email: "valid@example.com" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(appRouter.createCaller(context(admin)).staff.editAccount({ userId: -2, fullName: "Valid Name", email: "valid@example.com" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(appRouter.createCaller(context(admin)).staff.setAccountPassword({ userId: 0, password: "ValidPass1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(create).not.toHaveBeenCalled();
    expect(edit).not.toHaveBeenCalled();
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("normalizes create email/name before atomically creating and returns only the user id", async () => {
    const create = vi.spyOn(db, "createDirectStaffAccount").mockResolvedValue(42);
    const result = await appRouter.createCaller(context(admin)).staff.createAccount(createInput);

    expect(result).toEqual({ userId: 42 });
    expect(Object.keys(result)).toEqual(["userId"]);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: "New Staff Member",
      email: "new.staff@example.com",
      identifier: "new.staff@example.com",
      jobTitle: "Technical Staff",
      isActive: true,
      permissions: JSON.stringify(permissions),
      actorId: admin.id,
      openId: expect.stringMatching(/^local:/),
    }));
    const payload = create.mock.calls[0][0];
    expect(payload).not.toHaveProperty("password");
    expect(payload.passwordHash).toEqual(expect.any(String));
    expect(payload.passwordSalt).toEqual(expect.any(String));
    expect(payload.passwordHash).not.toContain(createInput.password);
    expect(payload.passwordSalt).not.toContain(createInput.password);
  });

  it("rejects the reserved Super Admin email and malformed create input before touching the DB", async () => {
    const create = vi.spyOn(db, "createDirectStaffAccount");
    await expect(appRouter.createCaller(context(admin)).staff.createAccount({ ...createInput, email: " ADMIN@ADMIN.COM " })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(appRouter.createCaller(context(admin)).staff.createAccount({ ...createInput, email: "not-an-email" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(appRouter.createCaller(context(admin)).staff.createAccount({ ...createInput, password: "weak" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(appRouter.createCaller(context(admin)).staff.createAccount({ ...createInput, permissions: { ...permissions, viewLeads: "yes" as never } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(create).not.toHaveBeenCalled();
  });

  it("maps explicit and nested Drizzle duplicate failures to CONFLICT", async () => {
    const create = vi.spyOn(db, "createDirectStaffAccount").mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "DUPLICATE_STAFF_ACCOUNT" }));
    await expect(appRouter.createCaller(context(admin)).staff.createAccount(createInput)).rejects.toMatchObject({ code: "CONFLICT" });

    create.mockRejectedValueOnce({ cause: { errno: 1062, sqlMessage: "Duplicate entry" } });
    await expect(appRouter.createCaller(context(admin)).staff.createAccount(createInput)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("edits only identity and returns the emailChanged flag", async () => {
    const edit = vi.spyOn(db, "editStaffAccount").mockResolvedValue({ success: true, emailChanged: true });
    const result = await appRouter.createCaller(context(admin)).staff.editAccount({ userId: 17, fullName: "  Renamed Staff  ", email: " New.Email@Example.COM " });
    expect(result).toEqual({ success: true, emailChanged: true });
    expect(edit).toHaveBeenCalledWith({ userId: 17, fullName: "Renamed Staff", email: "new.email@example.com", actorId: admin.id });
    expect(result).not.toHaveProperty("permissions");
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("passwordSalt");
  });

  it("rejects reserved and duplicate edit emails and does not mutate the account on failure", async () => {
    const edit = vi.spyOn(db, "editStaffAccount");
    await expect(appRouter.createCaller(context(admin)).staff.editAccount({ userId: 17, fullName: "Valid Staff", email: " ADMIN@ADMIN.COM " })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(edit).not.toHaveBeenCalled();

    edit.mockRejectedValueOnce(Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" }));
    await expect(appRouter.createCaller(context(admin)).staff.editAccount({ userId: 17, fullName: "Valid Staff", email: "other@example.com" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("sets a password through the existing hashPassword path and returns no secret", async () => {
    const setPassword = vi.spyOn(db, "setStaffAccountPassword").mockResolvedValue({ success: true });
    const result = await appRouter.createCaller(context(admin)).staff.setAccountPassword({ userId: 17, password: "Replacement1" });

    expect(result).toEqual({ success: true });
    expect(Object.keys(result)).toEqual(["success"]);
    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("passwordSalt");
    expect(setPassword).toHaveBeenCalledWith(expect.objectContaining({ userId: 17, actorId: admin.id }));
    const payload = setPassword.mock.calls[0][0];
    expect(payload).not.toHaveProperty("password");
    expect(payload.passwordHash).toEqual(expect.any(String));
    expect(payload.passwordSalt).toEqual(expect.any(String));
    expect(payload.passwordHash).not.toContain("Replacement1");
    expect(payload.passwordSalt).not.toContain("Replacement1");
  });

  it("returns NOT_FOUND for missing or non-local/admin targets without exposing secrets", async () => {
    vi.spyOn(db, "editStaffAccount").mockResolvedValue(null);
    vi.spyOn(db, "setStaffAccountPassword").mockResolvedValue(null);
    await expect(appRouter.createCaller(context(admin)).staff.editAccount({ userId: 999, fullName: "Valid Staff", email: "valid@example.com" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(appRouter.createCaller(context(admin)).staff.setAccountPassword({ userId: 30_001, password: "Replacement1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never exposes credential query parameters when a database operation fails", async () => {
    const sensitive = Object.assign(new Error("Query failed with PrivateHashValue and PrivateSaltValue"), { code: "ER_BAD_NULL_ERROR", sqlState: "23000", params: ["PrivateHashValue", "PrivateSaltValue"] });
    vi.spyOn(db, "createDirectStaffAccount").mockRejectedValue(sensitive);
    vi.spyOn(db, "editStaffAccount").mockRejectedValue(sensitive);
    vi.spyOn(db, "setStaffAccountPassword").mockRejectedValue(sensitive);
    const caller = appRouter.createCaller(context(admin));
    for (const operation of [() => caller.staff.createAccount(createInput), () => caller.staff.editAccount({ userId: 17, fullName: "Staff", email: "staff@example.com" }), () => caller.staff.setAccountPassword({ userId: 17, password: "Replacement1" })]) {
      const error = await operation().catch(error => error);
      expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "The staff account could not be saved. Please try again." });
      expect(error.cause).toBeUndefined();
      expect(JSON.stringify(error) + error.stack).not.toContain("PrivateHashValue");
      expect(JSON.stringify(error) + error.stack).not.toContain("PrivateSaltValue");
    }
  });
});
