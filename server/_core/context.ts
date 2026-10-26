import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { authenticateRequest } from "../auth";
import type { AuthenticatedPrincipal } from "../impersonation";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthenticatedPrincipal | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  let user: AuthenticatedPrincipal | null = null;
  try {
    user = await authenticateRequest(opts.req);
  } catch (error) {
    console.error("[Auth] Session lookup failed", error instanceof Error ? error.message : "unknown error");
  }
  return { req: opts.req, res: opts.res, user };
}
