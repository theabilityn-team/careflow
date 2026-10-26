import { notifyAccountSwitch, observeWorkspaceIdentity } from "@/lib/impersonation";
import { trpc } from "@/lib/trpc";
import { clearAccountQueries } from "@/lib/accountQueryCache";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

export function useAuth() {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: true, refetchInterval: 15_000 });
  const logoutMutation = trpc.auth.logout.useMutation();

  useEffect(() => {
    if (meQuery.isLoading || meQuery.data === undefined) return;
    if (observeWorkspaceIdentity(meQuery.data)) {
      void clearAccountQueries(queryClient).then(() => { notifyAccountSwitch(); window.location.assign("/"); });
    }
  }, [meQuery.data, meQuery.isLoading, queryClient]);

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      utils.auth.me.setData(undefined, null);
      await clearAccountQueries(queryClient);
      notifyAccountSwitch();
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, queryClient, utils]);

  return useMemo(() => ({
    user: meQuery.data ?? null,
    loading: meQuery.isLoading || logoutMutation.isPending,
    error: meQuery.error ?? logoutMutation.error ?? null,
    isAuthenticated: Boolean(meQuery.data),
    refresh: () => meQuery.refetch(),
    logout,
  }), [meQuery.data, meQuery.error, meQuery.isLoading, logoutMutation.error, logoutMutation.isPending, logout]);
}
