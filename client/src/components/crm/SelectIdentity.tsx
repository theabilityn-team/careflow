import type { ReactNode } from "react";

export function SelectIdentity({ name, email }: { name: ReactNode; email?: ReactNode }) {
  return (
    <span className="flex w-full min-w-0 flex-col items-start gap-0.5 whitespace-normal text-left [overflow-wrap:anywhere]">
      <span className="w-full min-w-0 break-words font-medium leading-5">{name}</span>
      {email && <span className="w-full min-w-0 break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{email}</span>}
    </span>
  );
}
