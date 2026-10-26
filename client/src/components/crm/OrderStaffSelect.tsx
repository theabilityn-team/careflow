import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OrderOwner } from "@/lib/sales";
import { cn } from "@/lib/utils";

export function StaffIdentity({ name, email }: { name: string; email?: string | null }) {
  return <span className="flex w-full min-w-0 flex-col items-start gap-0.5 whitespace-normal text-left [overflow-wrap:anywhere]">
    <span className="w-full min-w-0 break-words font-medium leading-5">{name}</span>
    {email && <span className="w-full min-w-0 break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{email}</span>}
  </span>;
}

export default function OrderStaffSelect({ value, onValueChange, owners, actor, includeMe = false, allowAll = false, className }: {
  value: string;
  onValueChange: (value: string) => void;
  owners: OrderOwner[];
  actor?: { name?: string | null; email?: string | null } | null;
  includeMe?: boolean;
  allowAll?: boolean;
  className?: string;
}) {
  const options = [
    ...(allowAll ? [{ value: "all", name: "All credited owners", email: null }] : []),
    ...(includeMe ? [{ value: "actor", name: `Me (${actor?.name || "current account"})`, email: actor?.email }] : []),
    ...owners.map(owner => ({ value: String(owner.userId), name: `${owner.name}${owner.isActive ? "" : " · Inactive (current owner)"}`, email: owner.email })),
  ];
  const selected = options.find(option => option.value === value);
  return <Select value={value} onValueChange={onValueChange}>
    <SelectTrigger aria-label="Credited owner" data-order-staff-selector className={cn("data-[size=default]:h-auto min-h-14 w-full min-w-0 py-2.5 sm:w-full md:data-[size=default]:h-auto *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:block *:data-[slot=select-value]:flex-1", className)}>
      <SelectValue placeholder="Select staff">{selected && <StaffIdentity name={selected.name} email={selected.email} />}</SelectValue>
    </SelectTrigger>
    <SelectContent align="start" collisionPadding={8} data-order-staff-options className="w-[min(28rem,calc(100vw-1rem))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1rem)]">
      {options.map(option => <SelectItem key={option.value} value={option.value} textValue={option.email ? `${option.name} ${option.email}` : option.name} className="min-h-12 py-3 md:py-3 *:last:flex-1">
        <StaffIdentity name={option.name} email={option.email} />
      </SelectItem>)}
    </SelectContent>
  </Select>;
}
