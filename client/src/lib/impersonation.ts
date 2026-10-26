export const ACCOUNT_SWITCH_EVENT = "careflow-account-session-switch";
let observedIdentity: string | undefined;
let expectedWorkspace: string | undefined;

export function workspaceIdentity(user: unknown): string | undefined {
  const principal = user as { id?: number } | null;
  if (!principal?.id) return undefined;
  return `${principal.id}:${impersonationInfo(user)?.actor.id ?? 0}`;
}

export function observeWorkspaceIdentity(user: unknown): boolean {
  expectedWorkspace = workspaceIdentity(user);
  const next = expectedWorkspace ?? "anonymous";
  const changed = observedIdentity !== undefined && observedIdentity !== next;
  observedIdentity = next;
  return changed;
}

export function workspaceHeaders(): Record<string, string> {
  return expectedWorkspace ? { "x-careflow-workspace": expectedWorkspace } : {};
}

export type ImpersonationInfo = {
  actor: { id: number; name: string; email: string | null };
  target: { id: number; name: string; email: string | null };
  expiresAt: number;
};

export function impersonationInfo(user: unknown): ImpersonationInfo | null {
  const value = (user as { impersonation?: ImpersonationInfo } | null)?.impersonation;
  return value && value.actor?.id && value.target?.id && Number.isFinite(value.expiresAt) ? value : null;
}

/** Cookie switching is server-side. Only a non-secret change notification is stored. */
export function notifyAccountSwitch(): void {
  try { window.localStorage.setItem(ACCOUNT_SWITCH_EVENT, `${Date.now()}-${Math.random()}`); } catch { /* Reload this tab even when storage is unavailable. */ }
}
