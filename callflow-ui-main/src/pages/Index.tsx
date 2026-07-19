import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Phone, PhoneCall, PhoneOff, CheckCircle2, TrendingUp,
  PhoneMissed, Users, Clock, Megaphone, ArrowRight,
  Activity,
} from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { KpiCard } from "@/components/KpiCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { listCalls, listCampaigns } from "@/lib/api";
import type { Call } from "@/lib/mock-data";
import type { Campaign } from "@/lib/api";
import { formatDate, formatDuration } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

// ── Chart colours ───────────────────────────────────────────────────────────
const CHART_COLORS = {
  primary:     "hsl(var(--primary))",
  success:     "hsl(var(--success, 142 71% 45%))",
  warning:     "hsl(var(--warning, 38 92% 50%))",
  destructive: "hsl(var(--destructive))",
  muted:       "hsl(var(--muted-foreground))",
};

const PIE_COLORS = [CHART_COLORS.success, CHART_COLORS.destructive, CHART_COLORS.warning, CHART_COLORS.muted];

// ── Helpers ─────────────────────────────────────────────────────────────────
function buildDailyData(calls: Call[]) {
  const map: Record<string, number> = {};
  calls.forEach((c) => {
    const day = new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    map[day] = (map[day] ?? 0) + 1;
  });
  const days = Object.keys(map).slice(-7);
  return days.map((day) => ({ day, calls: map[day] }));
}

function buildStatusData(calls: Call[]) {
  const counts = { Completed: 0, Failed: 0, "No Answer": 0, Other: 0 };
  calls.forEach((c) => {
    if (c.status === "completed") counts.Completed++;
    else if (c.status === "failed") counts.Failed++;
    else counts["No Answer"]++;
  });
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Index() {
  const [calls, setCalls]           = useState<Call[]>([]);
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([listCalls(), listCampaigns()]).then(([c, camps]) => {
      setCalls(c);
      setCampaigns(camps);
      setLoading(false);
    });
  }, []);

  const total     = calls.length;
  const active    = calls.filter((c) => ["connected", "dialing", "ringing"].includes(c.status)).length;
  const completed = calls.filter((c) => c.status === "completed").length;
  const failed    = calls.filter((c) => c.status === "failed").length;
  const avgDur    = completed
    ? Math.round(calls.filter((c) => c.duration > 0).reduce((s, c) => s + c.duration, 0) / (completed || 1))
    : 0;
  const runningCampaigns = campaigns.filter((c) => c.status === "running");

  const dailyData  = buildDailyData(calls);
  const statusData = buildStatusData(calls);
  const recentCalls = [...calls].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* ── KPI Grid ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Total Calls"       value={total.toLocaleString()}              icon={Phone}       tone="primary"     trend="All time" />
        <KpiCard label="Active Now"        value={active}                              icon={PhoneCall}   tone="warning"     trend="Live" />
        <KpiCard label="Connected"         value={completed.toLocaleString()}          icon={CheckCircle2} tone="success"    trend={total ? `${Math.round((completed / total) * 100)}% connect rate` : "—"} />
        <KpiCard label="Failed / No Answer" value={failed}                             icon={PhoneMissed} tone="destructive" trend={total ? `${Math.round((failed / total) * 100)}% failure rate` : "—"} />
        <KpiCard label="Avg Duration"      value={formatDuration(avgDur)}             icon={Clock}       tone="default"     trend="Connected calls" />
      </div>

      {/* ── Second KPI row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Campaigns"   value={campaigns.length}                    icon={Megaphone}   tone="primary"     trend="All campaigns" />
        <KpiCard label="Running"           value={runningCampaigns.length}             icon={Activity}    tone="warning"     trend="Active right now" />
        <KpiCard label="Total Leads"       value={campaigns.reduce((s, c) => s + c.total_contacts, 0).toLocaleString()} icon={Users} tone="default" trend="Across all campaigns" />
        <KpiCard label="Success Rate"      value={total ? `${Math.round((completed / total) * 100)}%` : "—"} icon={TrendingUp} tone="success" trend="Overall connection rate" />
      </div>

      {/* ── Charts row ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Daily Calls */}
        <Card className="shadow-card lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Daily Call Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : dailyData.length === 0 ? (
              <EmptyChart label="No call data yet" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="calls" stroke={CHART_COLORS.primary} fill="url(#callGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Call Status Distribution */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Call Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : statusData.length === 0 ? (
              <EmptyChart label="No data yet" />
            ) : (
              <div className="space-y-3">
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {statusData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="font-medium tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Running campaigns + Recent calls ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Running campaigns */}
        <Card className="shadow-card">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Running Campaigns</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link to="/campaigns">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
            ) : runningCampaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Megaphone className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No campaigns running</p>
                <Button variant="outline" size="sm" className="mt-3" asChild>
                  <Link to="/campaigns/new">Launch campaign</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {runningCampaigns.map((c) => {
                  const pct = c.total_contacts ? Math.round((c.done_contacts / c.total_contacts) * 100) : 0;
                  return (
                    <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{c.name}</p>
                        <Badge variant="outline" className="text-[10px] border-success/30 text-success">Running</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{c.done_contacts}/{c.total_contacts}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent calls */}
        <Card className="shadow-card">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link to="/results">View all <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10" />)}</div>
            ) : recentCalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <PhoneOff className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No calls yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentCalls.map((c) => (
                  <Link
                    key={c.id}
                    to={`/call-details/${c.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors group"
                  >
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      c.status === "completed" ? "bg-success/10 text-success" :
                      c.status === "failed"    ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground",
                    )}>
                      {c.customerName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.customerName}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDate(c.date)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={c.status} />
                      <span className="text-xs text-muted-foreground tabular-nums hidden group-hover:block">
                        {formatDuration(c.duration)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
