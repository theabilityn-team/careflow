/** SMTP setup and mailbox testing are an administrator responsibility. */
export function canManageEmailSettings(role: string | null | undefined): boolean {
  return role === "super_admin";
}
