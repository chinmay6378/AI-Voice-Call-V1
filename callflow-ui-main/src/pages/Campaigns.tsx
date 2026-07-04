import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Megaphone, Plus, Play, Pause, Trash2, BarChart2,
  Copy, MoreHorizontal, Search, RefreshCw, Users, CheckCircle2, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { listCampaigns, startCampaign, stopCampaign, getCampaignExportUrl } from "@/lib/api";
import type { Campaign } from "@/lib/api";
import { formatDate } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  running:   "border-success/30 bg-success/10 text-success",
  completed: "border-primary/30 bg-primary/10 text-primary",
  stopped:   "border-border bg-muted text-muted-foreground",
  pending:   "border-warning/30 bg-warning/10 text-warning",
};

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [q, setQ]                 = useState("");
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    listCampaigns().then((c) => { setCampaigns(c); setLoading(false); });
  };

  useEffect(load, []);

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(q.toLowerCase())
  );

  const handleStart = async (id: string) => {
    try {
      await startCampaign(id);
      toast.success("Campaign started");
      load();
    } catch (e) {
      toast.error("Failed to start", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleStop = async (id: string) => {
    try {
      await stopCampaign(id);
      toast.info("Campaign stopped");
      load();
    } catch {
      toast.error("Failed to stop campaign");
    }
  };

  const stats = {
    total:    campaigns.length,
    running:  campaigns.filter((c) => c.status === "running").length,
    done:     campaigns.filter((c) => c.status === "completed").length,
    leads:    campaigns.reduce((s, c) => s + c.total_contacts, 0),
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            {stats.total} total · {stats.running} running · {stats.leads.toLocaleString()} leads
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns…" className="pl-8 w-52" />
          </div>
          <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
          <Button className="bg-gradient-primary shadow-elegant hover:opacity-95" asChild>
            <Link to="/campaigns/new"><Plus className="mr-2 h-4 w-4" />New Campaign</Link>
          </Button>
        </div>
      </div>

      {/* ── Summary strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total",     value: stats.total,   color: "text-foreground" },
          { label: "Running",   value: stats.running,  color: "text-warning" },
          { label: "Completed", value: stats.done,     color: "text-success" },
          { label: "Leads",     value: stats.leads.toLocaleString(), color: "text-primary" },
        ].map((s) => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Campaign cards ── */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1,2,3,4].map((i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onStart={() => handleStart(c.id)}
              onStop={() => handleStop(c.id)}
              onView={() => navigate(`/results?campaign=${c.id}`)}
              onExport={() => { window.location.href = getCampaignExportUrl(c.id); toast.success("Downloading Excel…"); }}
          ))}
        </div>
      )}
    </div>
  );
}

// ── Campaign card ────────────────────────────────────────────────────────────
function CampaignCard({
  campaign: c,
  onStart,
  onStop,
  onView,
  onExport,
}: {
  campaign: Campaign;
  onStart: () => void;
  onStop: () => void;
  onView: () => void;
  onExport: () => void;
}) {
  const pct = c.total_contacts
    ? Math.round((c.done_contacts / c.total_contacts) * 100)
    : 0;
  const isRunning = c.status === "running";

  return (
    <Card className="shadow-card hover:shadow-md transition-shadow">
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Megaphone className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{c.name}</p>
              <p className="text-[10px] text-muted-foreground">{formatDate(c.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={cn("text-[10px] capitalize", STATUS_STYLES[c.status] ?? "")}>
              {isRunning && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success animate-pulse inline-block" />}
              {c.status}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={onView}><BarChart2 className="mr-2 h-3.5 w-3.5" />View Results</DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}><Download className="mr-2 h-3.5 w-3.5" />Export Excel</DropdownMenuItem>
                <DropdownMenuItem><Copy className="mr-2 h-3.5 w-3.5" />Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Total",    value: c.total_contacts },
            { label: "Done",     value: c.done_contacts },
            { label: "Progress", value: `${pct}%` },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/40 py-2">
              <p className="text-sm font-semibold">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={pct} className="h-1.5" />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {isRunning ? (
            <Button variant="outline" size="sm" className="flex-1" onClick={onStop}>
              <Pause className="mr-1.5 h-3.5 w-3.5" />Stop
            </Button>
          ) : c.status !== "completed" ? (
            <Button size="sm" className="flex-1 bg-gradient-primary hover:opacity-95" onClick={onStart}>
              <Play className="mr-1.5 h-3.5 w-3.5" />Launch
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="flex-1" disabled>
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-success" />Completed
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onView}>
            <BarChart2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="shadow-card">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Users className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold">No campaigns yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first campaign to start making AI calls at scale.</p>
        </div>
        <Button className="mt-2 bg-gradient-primary hover:opacity-95" asChild>
          <Link to="/campaigns/new"><Plus className="mr-2 h-4 w-4" />New Campaign</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
