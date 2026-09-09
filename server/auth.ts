import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "@shared/const";
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

export async function ensureSuperAdmin() {
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 10) {
    throw new Error("SUPER_ADMIN_PASSWORD must be configured with at least 10 characters");
  }
  const existing = await db.getLocalCredential(ADMIN_IDENTIFIER);
  if (existing) {
    const current = await verifyPassword(adminPassword, existing.credential.passwordSalt, existing.credential.passwordHash);
    if (!current) {
      const replacement = await hashPassword(adminPassword);
      await db.updateLocalPassword(existing.user.id, replacement.hash, replacement.salt);
      console.log("[Auth] Local Super Admin password synchronized");
    }
    return;
  }
  const { salt, hash } = await hashPassword(adminPassword);
  await db.createLocalUser({
    openId: "local:super-admin",
    name: "Super Administrator",
    email: null,
    role: "admin",
    identifier: ADMIN_IDENTIFIER,
    passwordHash: hash,
    passwordSalt: salt,
  });
  console.log("[Auth] Local Super Admin account initialized");
}

export async function authenticateCredentials(identifier: string, password: string) {
  const normalized = normalizeIdentifier(identifier);
  const record = await db.getLocalCredential(normalized);
  if (!record) return { ok: false as const, reason: "invalid" as const };
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

export async function createLoginSession(res: Response, req: Request, userId: number) {
  await db.deleteExpiredSessions();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await db.createAuthSession({ tokenHash: hashToken(token), userId, expiresAt });
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
  const record = await db.getAuthSession(hashToken(token));
  if (!record || record.session.expiresAt <= Date.now()) {
    if (record) await db.deleteAuthSession(hashToken(token));
    return null;
  }
  if (Date.now() - record.session.lastUsedAt > 5 * 60 * 1000) {
    await db.touchAuthSession(record.session.id);
  }
  return record.user;
}

export async function destroyLoginSession(req: Request, res: Response) {
  const token = getSessionToken(req);
  if (token) await db.deleteAuthSession(hashToken(token));
  res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(req), sameSite: "lax" });
}
