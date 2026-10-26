import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { runWithAuditIdentity } from "../auditIdentity";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

const auditIdentityMiddleware = t.middleware(async opts => {
  const { ctx, next } = opts;
  const impersonation = ctx.user?.impersonation;
  const identity = impersonation ? {
    actorId: impersonation.actor.id,
    actorName: impersonation.actor.name,
    targetId: impersonation.target.id,
    targetName: impersonation.target.name,
  } : undefined;
  return runWithAuditIdentity(identity, () => next());
});

function assertWorkspaceSignature(ctx: TrpcContext) {
  const supplied = ctx.req.headers["x-careflow-workspace"];
  if (typeof supplied !== "string" || !ctx.user) return;
  const expected = `${ctx.user.id}:${ctx.user.impersonation?.actor.id ?? 0}`;
  if (supplied !== expected) {
    throw new TRPCError({ code: "CONFLICT", message: "Your account session changed. Refresh to continue." });
  }
}

export const router = t.router;
export const publicProcedure = t.procedure.use(auditIdentityMiddleware);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  assertWorkspaceSignature(ctx);

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireUser);

export const adminProcedure = publicProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    assertWorkspaceSignature(ctx);

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
