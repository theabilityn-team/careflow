import { z } from "zod";

export const staffPasswordSchema = z.string()
  .min(10)
  .max(200)
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[0-9]/, "Add a number");

export const superAdminPasswordSchema = z.string()
  .min(12)
  .max(200)
  .regex(/[A-Z]/, "Add an uppercase letter")
  .regex(/[a-z]/, "Add a lowercase letter")
  .regex(/[0-9]/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a symbol");

export function isPasswordResetUsable(status: string, expiresAt: number | null, now: number) {
  return status === "ready" && expiresAt !== null && expiresAt >= now;
}
