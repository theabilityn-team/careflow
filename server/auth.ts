import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import type { User } from "../drizzle/schema";
import { COOKIE_NAME, SYSTEM_ADMIN_ACTOR_ID } from "@shared/const";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";

const scrypt = promisify(nodeScrypt);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const ADMIN_IDENTIFIER = "admin";

export const normalizeIdentifier = (value: string) => value.trim().toLowerCase();
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: derived.toString("hex") };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function systemAdminPrincipal(lastSignedIn = new Date()): User {
  return {
    id: SYSTEM_ADMIN_ACTOR_ID,
    openId: "system:super-admin",
    name: "Super Administrator",
    email: null,
    loginMethod: "system",
    role: "admin",
    createdAt: lastSignedIn,
    updatedAt: lastSignedIn,
    lastSignedIn,
  };
}

export async function ensureSuperAdmin() {
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 10) {
    throw new Error("SUPER_ADMIN_PASSWORD must be configured with at least 10 characters");
  }
  const existing = await db.getSystemAdminCredential();
  if (existing) {
    const current = await verifyPassword(adminPassword, existing.passwordSalt, existing.passwordHash);
    if (!current) {
      const replacement = await hashPassword(adminPassword);
      await db.upsertSystemAdminCredential({ passwordHash: replacement.hash, passwordSalt: replacement.salt });
      console.log("[Auth] System Super Admin password synchronized");
    }
    return;
  }
  const credential = await hashPassword(adminPassword);
  await db.upsertSystemAdminCredential({ passwordHash: credential.hash, passwordSalt: credential.salt });
  console.log("[Auth] System Super Admin credential initialized");
}

export async function authenticateStaffCredentials(identifier: string, password: string) {
  const record = await db.getLocalCredential(normalizeIdentifier(identifier));
  if (!record || record.user.role !== "user") return { ok: false as const, reason: "invalid" as const };
  if (record.credential.lockedUntil && record.credential.lockedUntil > Date.now()) {
    return { ok: false as const, reason: "locked" as const, lockedUntil: record.credential.lockedUntil };
  }
  const valid = await verifyPassword(password, record.credential.passwordSalt, record.credential.passwordHash);
  if (!valid) {
    const nextCount = record.credential.failedLoginCount + 1;
    const lockedUntil = nextCount >= LOCK_THRESHOLD ? Date.now() + LOCK_DURATION_MS : null;
    await db.updateLoginFailure(record.user.id, lockedUntil ? 0 : nextCount, lockedUntil);
    return { ok: false as const, reason: lockedUntil ? "locked" as const : "invalid" as const, lockedUntil };
  }
  await db.recordSuccessfulLogin(record.user.id);
  return { ok: true as const, user: record.user };
}

export async function authenticateSystemAdmin(password: string) {
  const credential = await db.getSystemAdminCredential();
  if (!credential) return { ok: false as const, reason: "invalid" as const };
  if (credential.lockedUntil && credential.lockedUntil > Date.now()) {
    return { ok: false as const, reason: "locked" as const, lockedUntil: credential.lockedUntil };
  }
  const valid = await verifyPassword(password, credential.passwordSalt, credential.passwordHash);
  if (!valid) {
    const nextCount = credential.failedLoginCount + 1;
    const lockedUntil = nextCount >= LOCK_THRESHOLD ? Date.now() + LOCK_DURATION_MS : null;
    await db.updateSystemAdminLoginFailure(lockedUntil ? 0 : nextCount, lockedUntil);
    return { ok: false as const, reason: lockedUntil ? "locked" as const : "invalid" as const, lockedUntil };
  }
  await db.recordSuccessfulSystemAdminLogin();
  return { ok: true as const, user: systemAdminPrincipal(new Date()) };
}

export async function createLoginSession(res: Response, req: Request, userId: number) {
  await db.deleteExpiredSessions();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db.createAuthSession({ tokenHash: hashToken(token), userId, expiresAt });
  setSessionCookie(res, req, token);
}

export async function createSystemAdminLoginSession(res: Response, req: Request) {
  await db.deleteExpiredSessions();
  const token = randomBytes(32).toString("base64url");
  await db.createSystemAdminSession({ tokenHash: hashToken(token), expiresAt: Date.now() + SESSION_TTL_MS });
  setSessionCookie(res, req, token);
}

function setSessionCookie(res: Response, req: Request, token: string) {
  res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(req),
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
  });
}

export function getSessionToken(req: Request) {
  return parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
}

export async function authenticateRequest(req: Request) {
  const token = getSessionToken(req);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const staffRecord = await db.getAuthSession(tokenHash);
  if (staffRecord) {
    if (staffRecord.session.expiresAt <= Date.now()) {
      await db.deleteAuthSession(tokenHash);
      return null;
    }
    if (Date.now() - staffRecord.session.lastUsedAt > 5 * 60 * 1000) await db.touchAuthSession(staffRecord.session.id);
    return staffRecord.user;
  }

  const adminSession = await db.getSystemAdminSession(tokenHash);
  if (!adminSession) return null;
  if (adminSession.expiresAt <= Date.now()) {
    await db.deleteSystemAdminSession(tokenHash);
    return null;
  }
  if (Date.now() - adminSession.lastUsedAt > 5 * 60 * 1000) await db.touchSystemAdminSession(adminSession.id);
  return systemAdminPrincipal();
}

export async function destroyLoginSession(req: Request, res: Response) {
  const token = getSessionToken(req);
  if (token) {
    const tokenHash = hashToken(token);
    await Promise.all([db.deleteAuthSession(tokenHash), db.deleteSystemAdminSession(tokenHash)]);
  }
  res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), sameSite: "lax" });
}
