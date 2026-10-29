import type { inferRouterInputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { EmptyState, PageHeader, PageLoading } from "@/components/crm/CrmUi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatDate } from "@/lib/crm";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  FolderSync,
  Info,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const ROOT_FOLDER_ID = "1UjUahdFTNTJxzWaTTeGJfQKvhm8URhLo";
const DEFAULT_PAGE_SIZE = 10;

type SyncCounts = {
  total: number;
  pending: number;
  processing: number;
  imported: number;
  attached: number;
  needs_review: number;
  failed: number;
  skipped: number;
  removed: number;
};

type SyncSettings = {
  rootFolderId?: string | null;
  connectorId?: string | null;
  publicBaseUrl?: string | null;
  enabled?: boolean;
  maxParallel?: number;
  batchSize?: number;
  scheduleTaskUid?: string | null;
  lastCheckedAt?: number | null;
  updatedAt?: number | null;
};

type SyncReady = {
  apiKeyPresent: boolean;
  driveConnected: boolean;
  callbackReady: boolean;
  workerScheduled: boolean;
};

type SyncFolder = {
  id: number;
  driveFolderId: string;
  name: string;
  active: boolean;
  status: string;
  desiredState: "running" | "paused" | "idle" | string;
  lastCheckedAt?: number | null;
  lastStartedAt?: number | null;
  lastCompletedAt?: number | null;
  lastError?: string | null;
  counts: SyncCounts;
};

type SyncEvent = {
  id?: number;
  folderId?: number | null;
  itemId?: number | null;
  jobId?: number | null;
  type: string;
  message: string;
  createdAt?: number | null;
};

type SyncStatus = {
  settings?: SyncSettings | null;
  ready: SyncReady;
  folders: SyncFolder[];
  events: SyncEvent[];
  jobs?: Array<{id:number;kind:string;status:string;manusTaskUrl:string|null;creditsUsed:number|null;lastError:string|null}>;
};

type SyncItem = {
  id: number;
  driveFileId: string;
  folderId: number;
  name: string;
  mimeType: string;
  byteSize?: number | null;
  modifiedTime?: string | null;
  status: string;
  attempts: number;
  lastError?: string | null;
  completedAt?: number | null;
};

type SyncItemsResult = {
  items: SyncItem[];
  total: number;
};

const systemSync = trpc.systemSync;

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatSyncTime(value: unknown) {
  if (typeof value === "number" || value instanceof Date)
    return formatDate(value, true);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return formatDate(parsed, true);
    return value;
  }
  return "Not yet";
}

function formatBytes(value: number | null | undefined) {
  if (!value || value < 1) return "—";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function statusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function statusClass(status: string) {
  if (
    ["imported", "attached", "completed", "ready", "running"].includes(status)
  )
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["needs_review", "waiting", "paused", "dispatching"].includes(status))
    return "border-amber-200 bg-amber-50 text-amber-800";
  if (["failed", "dispatch_unknown", "error"].includes(status))
    return "border-rose-200 bg-rose-50 text-rose-700";
  if (["processing"].includes(status))
    return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`w-fit capitalize ${statusClass(status)}`}
    >
      {statusLabel(status)}
    </Badge>
  );
}

function ReadinessRow({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-100 p-3.5">
      <div
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
      >
        {ready ? (
          <Check className="h-4 w-4" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0">
        <p className="break-words text-sm font-medium text-slate-800">
          {label}
        </p>
        <p className="mt-0.5 break-words text-xs leading-5 text-slate-500">
          {detail}
        </p>
      </div>
      <Badge
        variant="outline"
        className={`ml-auto shrink-0 ${ready ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}
      >
        {ready ? "Ready" : "Blocked"}
      </Badge>
    </div>
  );
}

function FolderCount({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const colors = {
    default: "bg-slate-50 text-slate-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-800",
    danger: "bg-rose-50 text-rose-700",
  };
  return (
    <div className={`min-w-0 rounded-xl px-3 py-2 ${colors[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] opacity-70">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function FolderCard({
  folder,
  onAction,
  busy,
  onInspect,
}: {
  folder: SyncFolder;
  onAction: (
    action: "sync" | "pause" | "resume" | "retry",
    folderId: number
  ) => void;
  busy: boolean;
  onInspect: () => void;
}) {
  const counts = folder.counts ?? ({} as SyncCounts);
  const total = safeCount(counts.total);
  const complete =
    safeCount(counts.imported) +
    safeCount(counts.attached) +
    safeCount(counts.needs_review) +
    safeCount(counts.failed) +
    safeCount(counts.skipped) +
    safeCount(counts.removed);
  const progress = total
    ? Math.min(100, Math.round((complete / total) * 100))
    : 0;
  const running =
    folder.desiredState === "running" ||
    ["running", "processing", "dispatching", "waiting"].includes(folder.status);
  const paused = folder.desiredState === "paused" || folder.status === "paused";

  return (
    <Card className="min-w-0 overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
      <CardContent className="min-w-0 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
              <FolderSync className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="break-words font-semibold text-slate-950 [overflow-wrap:anywhere]">
                  {folder.name}
                </h2>
                <StatusBadge status={folder.status || "not_checked"} />
              </div>
              <p className="mt-1 break-words text-xs text-slate-400">
                Folder status last checked{" "}
                {formatSyncTime(folder.lastCheckedAt)}
              </p>
            </div>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap">
            <Button
              variant="outline"
              className="min-h-11 bg-white"
              onClick={onInspect}
            >
              <Info className="mr-2 h-4 w-4" />
              View items
            </Button>
            {!running && !paused && (
              <Button
                className="min-h-11 bg-teal-700 hover:bg-teal-800"
                disabled={busy}
                onClick={() => onAction("sync", folder.id)}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Sync
              </Button>
            )}
            {running && (
              <Button
                variant="outline"
                className="min-h-11 bg-white"
                disabled={busy}
                onClick={() => onAction("pause", folder.id)}
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
            )}
            {paused && (
              <Button
                className="min-h-11 bg-teal-700 hover:bg-teal-800"
                disabled={busy}
                onClick={() => onAction("resume", folder.id)}
              >
                <Play className="mr-2 h-4 w-4" />
                Resume
              </Button>
            )}
            {safeCount(counts.failed) > 0 && (
              <Button
                variant="outline"
                className="min-h-11 bg-white"
                disabled={busy}
                onClick={() => onAction("retry", folder.id)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 min-[360px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-8">
          <FolderCount label="Total" value={total} />
          <FolderCount label="Pending" value={safeCount(counts.pending)} />
          <FolderCount
            label="Processing"
            value={safeCount(counts.processing)}
          />
          <FolderCount
            label="Imported"
            value={safeCount(counts.imported)}
            tone="success"
          />
          <FolderCount
            label="Attached"
            value={safeCount(counts.attached)}
            tone="success"
          />
          <FolderCount
            label="Review"
            value={safeCount(counts.needs_review)}
            tone="warning"
          />
          <FolderCount
            label="Failed"
            value={safeCount(counts.failed)}
            tone="danger"
          />
          <FolderCount label="Skipped" value={safeCount(counts.skipped)} />
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>Queue progress</span>
            <span className="font-medium tabular-nums text-slate-700">
              {progress}%
            </span>
          </div>
          <Progress value={progress} className="mt-2 h-2 bg-slate-100" />
        </div>
        <div className="mt-4 grid min-w-0 gap-2 text-xs text-slate-500 sm:grid-cols-3">
          <p className="min-w-0 break-words">
            <span className="font-medium text-slate-700">Last started:</span>{" "}
            {formatSyncTime(folder.lastStartedAt)}
          </p>
          <p className="min-w-0 break-words">
            <span className="font-medium text-slate-700">Last completed:</span>{" "}
            {formatSyncTime(folder.lastCompletedAt)}
          </p>
          <p className="min-w-0 break-words">
            <span className="font-medium text-slate-700">
              Removed from source:
            </span>{" "}
            {safeCount(counts.removed)}
          </p>
        </div>
        {folder.lastError && (
          <div className="mt-4 flex min-w-0 items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 break-words [overflow-wrap:anywhere]">
              <span className="font-semibold">Latest error:</span>{" "}
              {folder.lastError}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ItemStatusSummary({ item }: { item: SyncItem }) {
  return (
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
      <StatusBadge status={item.status} />
      <span className="text-xs text-slate-400">
        {item.mimeType || "Unknown type"}
      </span>
      <span className="text-xs text-slate-400">
        {formatBytes(item.byteSize)}
      </span>
      {item.attempts > 0 && (
        <span className="text-xs text-slate-400">
          {item.attempts} attempt{item.attempts === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function ItemsPanel({
  folder,
  statusFilter,
  setStatusFilter,
}: {
  folder: SyncFolder;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = DEFAULT_PAGE_SIZE;
  const queryInput = useMemo(
    () => ({
      folderId: folder.id,
      status: statusFilter === "all" ? undefined : statusFilter as inferRouterInputs<AppRouter>["systemSync"]["items"]["status"],
      page,
      pageSize,
    }),
    [folder.id, page, pageSize, statusFilter]
  );
  const itemsQuery = systemSync.items.useQuery(queryInput, {
    enabled: Boolean(folder.id),
    refetchInterval: 10_000,
  });
  const data = itemsQuery.data as SyncItemsResult | undefined;
  const items = data?.items ?? [];
  const total = safeCount(data?.total);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = total ? Math.min(page * pageSize, total) : 0;

  useEffect(() => setPage(1), [folder.id, statusFilter]);

  return (
    <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
      <CardHeader className="gap-4 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="break-words text-lg">Item detail</CardTitle>
            <p className="mt-1 break-words text-sm text-slate-500">
              Safe metadata only; image contents and source URLs are not
              displayed.
            </p>
          </div>
          <Select
            value={statusFilter}
            onValueChange={value => {
              setStatusFilter(value);
            }}
          >
            <SelectTrigger className="min-h-11 w-full bg-white sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All items</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="imported">Imported</SelectItem>
              <SelectItem value="attached">Attached</SelectItem>
              <SelectItem value="needs_review">Needs review</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {itemsQuery.isLoading ? (
          <div className="p-5">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading item metadata…
            </div>
          </div>
        ) : itemsQuery.error ? (
          <div className="m-4 break-words rounded-xl bg-rose-50 p-4 text-sm text-rose-700 [overflow-wrap:anywhere]">
            {itemsQuery.error.message}
          </div>
        ) : !items.length ? (
          <div className="p-5">
            <EmptyState
              title="No matching items"
              description={
                statusFilter === "needs_review"
                  ? "No items currently need identity or extraction review."
                  : "This folder has no discovered items for the selected filter."
              }
            />
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100 md:hidden">
              {items.map(item => (
                <div key={item.id} className="min-w-0 p-4">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-slate-900 [overflow-wrap:anywhere]">
                      {item.name}
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-400">
                      Modified {item.modifiedTime || "Not provided"} · Completed{" "}
                      {formatSyncTime(item.completedAt)}
                    </p>
                    <ItemStatusSummary item={item} />
                  </div>
                  {item.lastError && (
                    <p className="mt-3 break-words rounded-lg bg-rose-50 p-2.5 text-xs leading-5 text-rose-700 [overflow-wrap:anywhere]">
                      {item.lastError}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="pl-5">File</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Type / size</TableHead>
                    <TableHead>Modified</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead className="pr-5">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id} className="border-slate-100">
                      <TableCell className="max-w-[280px] break-words py-4 pl-5 font-medium [overflow-wrap:anywhere]">
                        {item.name}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-40 break-words text-sm text-slate-600">
                          {item.mimeType || "Unknown type"}
                          <p className="mt-1 text-xs text-slate-400">
                            {formatBytes(item.byteSize)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-600">
                        {item.modifiedTime || "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-slate-600">
                        {item.attempts}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-600">
                        {formatSyncTime(item.completedAt)}
                      </TableCell>
                      <TableCell className="max-w-[260px] break-words pr-5 text-xs text-rose-700 [overflow-wrap:anywhere]">
                        {item.lastError || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex min-w-0 flex-col gap-3 border-t border-slate-100 p-4 text-sm text-slate-500 min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
              <span>
                Showing {first}–{last} of {total}
              </span>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 min-w-0 px-2"
                  disabled={page <= 1 || itemsQuery.isFetching}
                  onClick={() => setPage(value => Math.max(1, value - 1))}
                >
                  <ChevronLeft className="h-4 w-4 min-[360px]:mr-1" />
                  <span className="hidden min-[360px]:inline">Previous</span>
                </Button>
                <span className="px-1 text-center text-xs font-medium text-slate-600">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 min-w-0 px-2"
                  disabled={page >= totalPages || itemsQuery.isFetching}
                  onClick={() =>
                    setPage(value => Math.min(totalPages, value + 1))
                  }
                >
                  <span className="hidden min-[360px]:inline">Next</span>
                  <ChevronRight className="h-4 w-4 min-[360px]:ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SystemSync() {
  const { user } = useAuth();
  const accessQuery = trpc.dashboard.access.useQuery();
  const isAdmin = accessQuery.data?.role === "super_admin";
  const statusQuery = systemSync.status.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const configure = systemSync.configure.useMutation();
  const checkFolders = systemSync.checkFolders.useMutation();
  const syncFolder = systemSync.syncFolder.useMutation();
  const pauseFolder = systemSync.pauseFolder.useMutation();
  const resumeFolder = systemSync.resumeFolder.useMutation();
  const retryFailed = systemSync.retryFailed.useMutation();
  const inspectJob = systemSync.inspectJob.useMutation();
  const utils = trpc.useUtils();

  const status = statusQuery.data as SyncStatus | undefined;
  const folders = status?.folders ?? [];
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [maxParallel, setMaxParallel] = useState("3");
  const [batchSize, setBatchSize] = useState("50");
  const [busyFolderId, setBusyFolderId] = useState<number | null>(null);

  useEffect(() => {
    if (!folders.length) {
      setSelectedFolderId(null);
      return;
    }
    setSelectedFolderId(current =>
      current !== null && folders.some(folder => folder.id === current)
        ? current
        : folders[0].id
    );
  }, [folders]);

  useEffect(() => {
    const settings = status?.settings;
    if (!settings) return;
    setPublicBaseUrl(settings.publicBaseUrl ?? "");
    setMaxParallel(String(settings.maxParallel ?? 3));
    setBatchSize(String(settings.batchSize ?? 50));
  }, [status?.settings?.publicBaseUrl, status?.settings?.maxParallel, status?.settings?.batchSize]);

  const selectedFolder =
    folders.find(folder => folder.id === selectedFolderId) ?? null;
  const ready = status?.ready;
  const settings = status?.settings;
  const activeJobs = folders.filter(
    folder => folder.desiredState === "running"
  ).length;
  const reviewCount = folders.reduce(
    (sum, folder) => sum + safeCount(folder.counts?.needs_review),
    0
  );
  const failedCount = folders.reduce(
    (sum, folder) => sum + safeCount(folder.counts?.failed),
    0
  );

  async function refreshStatus() {
    await statusQuery.refetch();
    await utils.dashboard.access.invalidate();
  }

  async function saveSettings() {
    try {
      await configure.mutateAsync({
        rootFolderId: ROOT_FOLDER_ID,
        publicBaseUrl: publicBaseUrl.trim() || undefined,
        maxParallel: Math.max(1, Math.min(3, Number(maxParallel) || 3)),
        batchSize: Math.max(1, Math.min(50, Number(batchSize) || 50)),
      });
      toast.success("System sync settings saved.");
      await statusQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "System sync settings could not be saved."
      );
    }
  }

  async function runFolderAction(
    action: "sync" | "pause" | "resume" | "retry",
    folderId: number
  ) {
    const labels = {
      sync: "Sync started.",
      pause: "Folder paused.",
      resume: "Folder resumed.",
      retry: "Failed items queued for retry.",
    };
    const mutations = {
      sync: syncFolder,
      pause: pauseFolder,
      resume: resumeFolder,
      retry: retryFailed,
    };
    setBusyFolderId(folderId);
    try {
      await mutations[action].mutateAsync({ folderId });
      toast.success(labels[action]);
      await statusQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The folder action could not be completed."
      );
    } finally {
      setBusyFolderId(null);
    }
  }

  async function runCheckFolders() {
    try {
      await checkFolders.mutateAsync();
      toast.success(
        "Folder check started. Counts will update as discovery completes."
      );
      await statusQuery.refetch();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Folder check could not be started."
      );
    }
  }

  if (accessQuery.isLoading || (isAdmin && statusQuery.isLoading))
    return <PageLoading />;
  if (!user || !isAdmin)
    return (
      <EmptyState
        title="System sync is restricted"
        description="Only Super Admins can inspect the connected Drive queue or control synchronization."
      />
    );
  if (statusQuery.error)
    return (
      <div className="mx-auto max-w-3xl break-words rounded-2xl bg-rose-50 p-6 text-sm text-rose-700 [overflow-wrap:anywhere]">
        <p className="font-semibold">System sync is unavailable</p>
        <p className="mt-2">{statusQuery.error.message}</p>
        <Button
          variant="outline"
          className="mt-4 bg-white"
          onClick={() => statusQuery.refetch()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );

  return (
    <div className="mx-auto min-w-0 max-w-[1450px]">
      <PageHeader
        eyebrow="Super Admin · System operations"
        title="System sync"
        description="Monitor the read-only Drive discovery queue and review import outcomes. Sync workers progress through callbacks and verified heartbeats; this page never starts work automatically."
        actions={
          <Button
            variant="outline"
            className="min-h-11 w-full bg-white sm:w-auto"
            onClick={runCheckFolders}
            disabled={checkFolders.isPending}
          >
            <FolderSync className="mr-2 h-4 w-4" />
            {checkFolders.isPending ? "Checking…" : "Check folders"}
          </Button>
        }
      />

      <Alert className="mb-6 min-w-0 rounded-2xl border-sky-200 bg-sky-50 text-sky-950">
        <Info className="h-4 w-4 text-sky-700" />
        <AlertTitle>Costs and safety</AlertTitle>
        <AlertDescription className="break-words leading-6 text-sky-900">
          Folder checks and imports can use connected service credits. CareFlow
          reads supported image metadata, keeps source files untouched, and
          never exposes API keys, callback tokens, raw file URLs, or clinical
          OCR in this dashboard.
        </AlertDescription>
      </Alert>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
              <FolderSync className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Folders
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {folders.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700">
              <ServerCog className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Running folders
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {activeJobs}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Clock3 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Needs review
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {reviewCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-white shadow-sm">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-700">
              <XCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Failed items
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-950">
                {failedCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {!!status?.jobs?.length && <Card className="mb-6 min-w-0 rounded-2xl border-0 bg-white shadow-sm"><CardHeader><CardTitle>Manus tasks</CardTitle></CardHeader><CardContent className="space-y-3">{status.jobs.slice(0,10).map(job=><div key={job.id} className="flex min-w-0 flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0 break-words"><p className="text-sm font-medium">#{job.id} · {job.kind} · {statusLabel(job.status)}</p><p className="text-xs text-slate-500">{job.creditsUsed === null ? "Credits pending provider report" : `${job.creditsUsed} credits`}</p>{job.lastError && <p className="mt-1 break-words text-xs text-amber-800">{job.lastError}</p>}</div><div className="flex shrink-0 flex-wrap gap-2">{job.manusTaskUrl && <Button asChild variant="outline" className="min-h-11"><a href={job.manusTaskUrl} target="_blank" rel="noopener noreferrer">Open task</a></Button>}<Button variant="outline" className="min-h-11" disabled={inspectJob.isPending} onClick={async()=>{try{await inspectJob.mutateAsync({jobId:job.id});await statusQuery.refetch();}catch(error){toast.error(error instanceof Error?error.message:"Task status unavailable.");}}}>Check task</Button></div></div>)}</CardContent></Card>}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
          <CardHeader className="border-b border-slate-100 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg">Readiness</CardTitle>
                <p className="mt-1 break-words text-sm leading-6 text-slate-500">
                  Paid task creation stays blocked until every required
                  dependency is ready.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 sm:p-5">
            {ready ? (
              <>
                <ReadinessRow
                  label="Manus API key"
                  ready={ready.apiKeyPresent}
                  detail="Configured server-side; never returned to the browser."
                />
                <ReadinessRow
                  label="Drive connector"
                  ready={ready.driveConnected}
                  detail="Connected Drive access is available for read-only discovery."
                />
                <ReadinessRow
                  label="Callback deployment"
                  ready={ready.callbackReady}
                  detail="Authenticated callbacks are reachable by workers."
                />
                <ReadinessRow
                  label="Worker schedule"
                  ready={ready.workerScheduled}
                  detail="Verified heartbeat or schedule is in place."
                />
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading readiness…
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
          <CardHeader className="border-b border-slate-100 p-4 sm:p-5">
            <CardTitle className="text-lg">Sync settings</CardTitle>
            <p className="mt-1 break-words text-sm leading-6 text-slate-500">
              The Drive root is fixed by the implementation contract. No
              credential fields are shown.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="space-y-2">
              <Label htmlFor="sync-root">Drive root folder</Label>
              <Input
                id="sync-root"
                value={settings?.rootFolderId || ROOT_FOLDER_ID}
                readOnly
                className="min-w-0 bg-slate-50 text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="callback-url">Public callback base URL</Label>
              <Input
                id="callback-url"
                value={publicBaseUrl}
                onChange={event => setPublicBaseUrl(event.target.value)}
                placeholder="https://crm.example.com"
                className="min-w-0"
              />
            </div>
            <div className="grid gap-4 min-[360px]:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="max-parallel">Max parallel</Label>
                <Input
                  id="max-parallel"
                  type="number"
                  min={1}
                  max={3}
                  value={maxParallel}
                  onChange={event => setMaxParallel(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-size">Batch size</Label>
                <Input
                  id="batch-size"
                  type="number"
                  min={1}
                  max={50}
                  value={batchSize}
                  onChange={event => setBatchSize(event.target.value)}
                />
              </div>
            </div>
            <Button
              className="min-h-11 w-full bg-teal-700 hover:bg-teal-800"
              onClick={saveSettings}
              disabled={configure.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {configure.isPending ? "Saving…" : "Save settings"}
            </Button>
            <p className="break-words text-xs leading-5 text-slate-400">
              Configured parallelism is capped at 3 active external tasks
              globally; batch size is capped at 50 files.
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="mt-8 min-w-0">
        <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold tracking-tight text-slate-950">
              Discovered folders
            </h2>
            <p className="mt-1 break-words text-sm text-slate-500">
              Only numbered root folders matching “Images” are included.
              Descendants are discovered read-only.
            </p>
          </div>
          <p className="text-xs text-slate-400">
            Last global check: {formatSyncTime(settings?.lastCheckedAt)}
          </p>
        </div>
        {!folders.length ? (
          <Card className="rounded-2xl border-0 bg-white shadow-sm">
            <CardContent className="p-5">
              <EmptyState
                title="No folders discovered yet"
                description="Use Check folders to discover eligible numbered Images folders. This action does not start an import."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {folders.map(folder => (
              <FolderCard
                key={folder.id}
                folder={folder}
                onAction={runFolderAction}
                busy={busyFolderId === folder.id}
                onInspect={() => {
                  setSelectedFolderId(folder.id);
                  setStatusFilter("all");
                }}
              />
            ))}
          </div>
        )}
      </section>

      {selectedFolder && (
        <section className="mt-8 min-w-0">
          <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-xl font-semibold tracking-tight text-slate-950">
                {selectedFolder.name}
              </h2>
              <p className="mt-1 break-words text-sm text-slate-500">
                Paginated item metadata for the selected folder.
              </p>
            </div>
            <StatusBadge status={selectedFolder.status || "not_checked"} />
          </div>
          <ItemsPanel
            folder={selectedFolder}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
        </section>
      )}

      {status?.events?.length ? (
        <section className="mt-8 min-w-0">
          <Card className="rounded-2xl border-0 bg-white shadow-[0_8px_30px_rgba(15,23,42,.045)]">
            <CardHeader className="border-b border-slate-100 p-4 sm:p-5">
              <CardTitle className="text-lg">Recent activity</CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Operational messages only; credentials and raw clinical content
                are omitted.
              </p>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 p-0">
              {status.events.slice(0, 50).map((event, index) => (
                <div
                  key={`${event.id ?? event.createdAt ?? "event"}-${index}`}
                  className="flex min-w-0 items-start gap-3 p-4"
                >
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-500">
                    <Circle className="h-3.5 w-3.5 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm text-slate-700 [overflow-wrap:anywhere]">
                      {event.message}
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-400">
                      {statusLabel(event.type)} ·{" "}
                      {formatSyncTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
