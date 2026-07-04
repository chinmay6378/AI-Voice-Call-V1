import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, RefreshCw, Download, Eye, Filter,
  PhoneOff, ChevronDown,
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
import { listCalls, getCallsExportUrl } from "@/lib/api";
import type { Call } from "@/lib/mock-data";
import { formatDate, formatDuration } from "@/lib/mock-data";
import { toast } from "sonner";

const STATUS_OPTIONS = ["all","dialing","ringing","connected","completed","failed"];

export default function CallResults() {
  const [calls, setCalls]       = useState<Call[]>([]);
  const [loading, setLoading]   = useState(true);
  const [q, setQ]               = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const load = () => {
    setLoading(true);
    listCalls().then((c) => { setCalls(c); setLoading(false); });
  };

  useEffect(load, []);

  // Pre-filter by campaign if URL has ?campaign=
  const campaignId = searchParams.get("campaign");

  const filtered = calls.filter((c) => {
    const matchQ =
      c.customerName.toLowerCase().includes(q.toLowerCase()) ||
      c.phoneNumber.includes(q) ||
      c.id.toLowerCase().includes(q.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchQ && matchStatus;
  });

  const stats = {
    total:     calls.length,
    completed: calls.filter((c) => c.status === "completed").length,
    failed:    calls.filter((c) => c.status === "failed").length,
    active:    calls.filter((c) => ["connected","dialing","ringing"].includes(c.status)).length,
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
    a.download = "call-results.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported " + filtered.length + " calls");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Call Results</h2>
          <p className="text-sm text-muted-foreground">
            {stats.total.toLocaleString()} total calls
            {campaignId && " · Filtered by campaign"}
          </p>
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
          <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-4 w-4" />Export<ChevronDown className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>Export CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { window.location.href = getCallsExportUrl(); toast.success("Downloading Excel…"); }}>
                Export Excel (with summaries)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Summary badges ── */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "Total",     value: stats.total,     style: "" },
          { label: "Completed", value: stats.completed,  style: "border-success/30 bg-success/5 text-success" },
          { label: "Failed",    value: stats.failed,     style: "border-destructive/30 bg-destructive/5 text-destructive" },
          { label: "Active",    value: stats.active,     style: "border-primary/30 bg-primary/5 text-primary" },
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
          <p className="text-xs text-muted-foreground">Try adjusting the search or status filter.</p>
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
                      <DispositionBadge status={c.status} hasSummary={!!c.summary} />
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
          </div>
        </Card>
      )}
    </div>
  );
}

function DispositionBadge({ status, hasSummary }: { status: string; hasSummary: boolean }) {
  if (status === "completed" && hasSummary) {
    return <Badge variant="outline" className="border-success/30 bg-success/5 text-success text-[10px]">Interested</Badge>;
  }
  if (status === "completed") {
    return <Badge variant="outline" className="text-[10px]">Completed</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="outline" className="border-destructive/30 bg-destructive/5 text-destructive text-[10px]">No Answer</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground text-[10px]">—</Badge>;
}
