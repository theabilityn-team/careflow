import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { appRouter } from "./routers";

const now = new Date("2026-10-25T00:00:00Z");
const admin = {
  id: 1,
  openId: "system:admin",
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
  openId: "staff:17",
  name: "Staff Member",
  email: "staff@example.com",
  loginMethod: "local",
  role: "user" as const,
  createdAt: now,
  updatedAt: now,
  lastSignedIn: now,
};

function context(user: typeof admin | typeof staff | null): TrpcContext {
  return {
    user,
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("email library deletion mutations", () => {
  it("allows only admins to delete products and cascades through the helper result", async () => {
    const deleteProduct = vi
      .spyOn(db, "deleteEmailProduct")
      .mockResolvedValue({ deletedTemplateCount: 3 });
    const caller = appRouter.createCaller(context(admin));

    await expect(
      caller.emailLibrary.deleteProduct({ id: 12 })
    ).resolves.toEqual({ deletedTemplateCount: 3 });
    expect(deleteProduct).toHaveBeenCalledWith(12, admin.id);

    await expect(
      appRouter
        .createCaller(context(staff))
        .emailLibrary.deleteProduct({ id: 12 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      appRouter
        .createCaller(context(null))
        .emailLibrary.deleteProduct({ id: 12 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deleteProduct).toHaveBeenCalledTimes(1);
  });

  it("allows only admins to delete templates and returns the helper success value", async () => {
    const deleteTemplate = vi
      .spyOn(db, "deleteEmailMessageTemplate")
      .mockResolvedValue({ success: true });
    const caller = appRouter.createCaller(context(admin));

    await expect(
      caller.emailLibrary.deleteTemplate({ id: 8 })
    ).resolves.toEqual({ success: true });
    expect(deleteTemplate).toHaveBeenCalledWith(8, admin.id);

    await expect(
      appRouter
        .createCaller(context(staff))
        .emailLibrary.deleteTemplate({ id: 8 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      appRouter
        .createCaller(context(null))
        .emailLibrary.deleteTemplate({ id: 8 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deleteTemplate).toHaveBeenCalledTimes(1);
  });

  it("maps a missing or concurrently removed product/template to NOT_FOUND", async () => {
    const deleteProduct = vi
      .spyOn(db, "deleteEmailProduct")
      .mockResolvedValue(null);
    const deleteTemplate = vi
      .spyOn(db, "deleteEmailMessageTemplate")
      .mockResolvedValue(null);
    const caller = appRouter.createCaller(context(admin));

    await expect(
      caller.emailLibrary.deleteProduct({ id: 12 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller.emailLibrary.deleteTemplate({ id: 8 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(deleteProduct).toHaveBeenCalledWith(12, admin.id);
    expect(deleteTemplate).toHaveBeenCalledWith(8, admin.id);
  });

  it("rejects non-positive and non-integer IDs before calling deletion helpers", async () => {
    const deleteProduct = vi.spyOn(db, "deleteEmailProduct");
    const deleteTemplate = vi.spyOn(db, "deleteEmailMessageTemplate");
    const caller = appRouter.createCaller(context(admin));

    for (const id of [0, -1, 1.5]) {
      await expect(
        caller.emailLibrary.deleteProduct({ id })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        caller.emailLibrary.deleteTemplate({ id })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    expect(deleteProduct).not.toHaveBeenCalled();
    expect(deleteTemplate).not.toHaveBeenCalled();
  });

  it("propagates product and template deletion failures without remapping them", async () => {
    const productFailure = new Error("product deletion failed");
    const templateFailure = new Error("template deletion failed");
    const deleteProduct = vi
      .spyOn(db, "deleteEmailProduct")
      .mockRejectedValue(productFailure);
    const deleteTemplate = vi
      .spyOn(db, "deleteEmailMessageTemplate")
      .mockRejectedValue(templateFailure);
    const caller = appRouter.createCaller(context(admin));

    await expect(
      caller.emailLibrary.deleteProduct({ id: 12 })
    ).rejects.toMatchObject({ message: productFailure.message });
    await expect(
      caller.emailLibrary.deleteTemplate({ id: 8 })
    ).rejects.toMatchObject({ message: templateFailure.message });
    expect(deleteProduct).toHaveBeenCalledWith(12, admin.id);
    expect(deleteTemplate).toHaveBeenCalledWith(8, admin.id);
  });
});
