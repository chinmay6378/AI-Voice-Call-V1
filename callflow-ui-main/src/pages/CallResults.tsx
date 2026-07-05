import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, RefreshCw, Download, Eye, Filter,
  PhoneOff, ChevronDown, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/StatusBadge";
import { listCalls, getCampaign, getCallsExportUrl, getCampaignExportUrl } from "@/lib/api";
import type { Call } from "@/lib/mock-data";
import { formatDate, formatDuration } from "@/lib/mock-data";
import { toast } from "sonner";

const STATUS_OPTIONS = ["all","connected","completed","voicemail","no_answer","busy","failed","dialing","ringing","cancelled"];
const ACTIVE_STATUSES = new Set(["connected","dialing","ringing"]);
const AUTO_REFRESH_MS = 5000;

export default function CallResults() {
  const [calls, setCalls]               = useState<Call[]>([]);
  const [loading, setLoading]           = useState(true);
  const [q, setQ]                       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaign") ?? undefined;
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    listCalls(campaignId)
      .then((c) => { setCalls(c); setLoading(false); })
      .catch(() => setLoading(false));
  };

  // Fetch campaign name once if filtered
  useEffect(() => {
    if (!campaignId) return;
    getCampaign(campaignId)
      .then((c) => setCampaignName(c.name))
      .catch(() => setCampaignName(null));
  }, [campaignId]);

  useEffect(() => { load(); }, [campaignId]);

  // Auto-refresh while active calls exist
  useEffect(() => {
    const hasActive = calls.some((c) => ACTIVE_STATUSES.has(c.status));
    if (hasActive && !timerRef.current) {
      timerRef.current = setInterval(() => load(true), AUTO_REFRESH_MS);
    } else if (!hasActive && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [calls]);

  const filtered = calls.filter((c) => {
    const matchQ =
      c.customerName.toLowerCase().includes(q.toLowerCase()) ||
      c.phoneNumber.includes(q) ||
      c.id.toLowerCase().includes(q.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchQ && matchStatus;
  });

  // Stats scoped to the filtered/campaign set, not global
  const stats = {
    total:     filtered.length,
    completed: filtered.filter((c) => c.status === "completed").length,
    voicemail: filtered.filter((c) => c.status === "voicemail").length,
    no_answer: filtered.filter((c) => ["no_answer","busy","failed"].includes(c.status)).length,
    active:    filtered.filter((c) => ACTIVE_STATUSES.has(c.status)).length,
  };

  const exportCsv = () => {
    const rows = [
      ["Call ID","Customer","Phone","Status","Duration","Date"],
      ...filtered.map((c) => [
        c.id, c.customerName, c.phoneNumber, c.status,
        formatDuration(c.duration), formatDate(c.date),
      ]),
    ];
    const csv  = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = campaignId ? `campaign-${campaignId}.csv` : "call-results.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported " + filtered.length + " calls");
  };

  const hasActive = calls.some((c) => ACTIVE_STATUSES.has(c.status));

  return (
    <div className="mx-auto max-w-7xl space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {campaignId && (
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 shrink-0"
              onClick={() => navigate("/campaigns")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {campaignName ? `${campaignName} — Results` : "Call Results"}
            </h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              {calls.length.toLocaleString()} calls
              {campaignId && !campaignName && " · Filtered by campaign"}
              {hasActive && (
                <span className="inline-flex items-center gap-1 text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  Live · auto-refreshing
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, phone, ID…"
              className="pl-8 w-56"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <Filter className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s === "all" ? "All statuses" : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => load()}><RefreshCw className="h-4 w-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" />Export<ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>Export CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                const url = campaignId ? getCampaignExportUrl(campaignId) : getCallsExportUrl();
                window.location.href = url;
                toast.success("Downloading Excel…");
              }}>
                Export Excel (with summaries)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Summary badges ── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "Total",      value: stats.total,     style: "" },
          { label: "Connected",  value: stats.completed,  style: "border-success/30 bg-success/5 text-success" },
          { label: "Voicemail",  value: stats.voicemail,  style: "border-warning/30 bg-warning/5 text-warning" },
          { label: "No Answer",  value: stats.no_answer,  style: "border-border bg-muted/50 text-muted-foreground" },
          { label: "Active",     value: stats.active,     style: "border-primary/30 bg-primary/5 text-primary" },
        ].map((s) => (
          <Badge key={s.label} variant="outline" className={s.style}>
            {s.label}: {s.value}
          </Badge>
        ))}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <Card className="p-4 shadow-card">
          <div className="space-y-3">
            {[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-14 text-center shadow-card">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <PhoneOff className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No calls match your filters</p>
          <p className="text-xs text-muted-foreground">
            {campaignId
              ? "This campaign has no calls yet, or none match the current filter."
              : "Try adjusting the search or status filter."}
          </p>
        </Card>
      ) : (
        <Card className="shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Disposition</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => navigate(`/calls/${c.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {c.customerName.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{c.customerName}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{c.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.phoneNumber}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="tabular-nums text-sm">{formatDuration(c.duration)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatDate(c.date)}</TableCell>
                    <TableCell>
                      <DispositionBadge status={c.status} hasSummary={!!c.summary} errorMessage={c.errorMessage} />
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/calls/${c.id}`)}
                        className="text-xs"
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            Showing {filtered.length} of {calls.length} calls
            {q || statusFilter !== "all" ? " (filtered)" : ""}
          </div>
        </Card>
      )}
    </div>
  );
}

function DispositionBadge({ status, hasSummary, errorMessage }: { status: string; hasSummary: boolean; errorMessage?: string }) {
  if (status === "voicemail") return (
    <Badge variant="outline" className="border-warning/30 bg-warning/5 text-warning text-[10px]">Voicemail Left</Badge>
  );
  if (status === "no_answer") return (
    <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground text-[10px]">No Answer</Badge>
  );
  if (status === "busy") return (
    <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground text-[10px]">Busy</Badge>
  );
  if (status === "cancelled") return (
    <Badge variant="outline" className="border-border text-muted-foreground text-[10px]">Cancelled</Badge>
  );
  if (status === "failed") return (
    <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive text-[10px]"
      title={errorMessage ?? "Call failed"}>
      {errorMessage ? "Error" : "Failed"}
    </Badge>
  );
  if (status === "completed" && hasSummary) return (
    <Badge variant="outline" className="border-success/30 bg-success/5 text-success text-[10px]">Connected</Badge>
  );
  if (status === "completed") return (
    <Badge variant="outline" className="text-[10px]">Completed</Badge>
  );
  return <Badge variant="outline" className="text-muted-foreground text-[10px]">—</Badge>;
}
