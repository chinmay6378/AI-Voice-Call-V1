import { useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, Phone, Clock, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KpiCard } from "@/components/KpiCard";
import { listCalls, listCampaigns } from "@/lib/api";
import type { Call } from "@/lib/mock-data";
import type { Campaign } from "@/lib/api";
import { formatDuration } from "@/lib/mock-data";

const C = {
  primary:  "hsl(var(--primary))",
  success:  "hsl(142 71% 45%)",
  warning:  "hsl(38 92% 50%)",
  danger:   "hsl(var(--destructive))",
  muted:    "hsl(var(--muted-foreground))",
};
const TOOLTIP_STYLE = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

// ── Data builders ─────────────────────────────────────────────────────────────
function groupByDay(calls: Call[], days = 7) {
  const map: Record<string, { calls: number; connected: number; duration: number }> = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    map[label] = { calls: 0, connected: 0, duration: 0 };
  }
  calls.forEach((c) => {
    const label = new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (map[label]) {
      map[label].calls++;
      if (c.status === "completed") map[label].connected++;
      map[label].duration += c.duration;
    }
  });
  return Object.entries(map).map(([day, v]) => ({
    day,
    Calls: v.calls,
    Connected: v.connected,
    "Avg Duration (s)": v.calls ? Math.round(v.duration / v.calls) : 0,
  }));
}

function hourlyDistribution() {
  const hours = [
    { hour: "8am",  calls: 12 }, { hour: "9am",  calls: 34 },
    { hour: "10am", calls: 58 }, { hour: "11am", calls: 71 },
    { hour: "12pm", calls: 45 }, { hour: "1pm",  calls: 39 },
    { hour: "2pm",  calls: 62 }, { hour: "3pm",  calls: 78 },
    { hour: "4pm",  calls: 55 }, { hour: "5pm",  calls: 28 },
    { hour: "6pm",  calls: 14 },
  ];
  return hours;
}

function funnelData(calls: Call[]) {
  const total     = calls.length;
  const dialed    = total;
  const connected = calls.filter((c) => c.status === "completed").length;
  const voicemail = Math.round(total * 0.15);
  const noAnswer  = calls.filter((c) => c.status === "failed").length;
  return [
    { stage: "Dialed",    value: dialed },
    { stage: "Connected", value: connected },
    { stage: "Voicemail", value: voicemail },
    { stage: "No Answer", value: noAnswer },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const [calls, setCalls]         = useState<Call[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [range, setRange]         = useState("7");

  const load = () => {
    setLoading(true);
    Promise.all([listCalls(), listCampaigns()]).then(([c, camps]) => {
      setCalls(c);
      setCampaigns(camps);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const total     = calls.length;
  const completed = calls.filter((c) => c.status === "completed").length;
  const avgDur    = completed
    ? Math.round(calls.filter((c) => c.duration > 0).reduce((s, c) => s + c.duration, 0) / (completed || 1))
    : 0;
  const connectRate = total ? Math.round((completed / total) * 100) : 0;

  const daily   = groupByDay(calls, Number(range));
  const hourly  = hourlyDistribution();
  const funnel  = funnelData(calls);
  const campBar = campaigns.slice(0, 6).map((c) => ({
    name: c.name.length > 14 ? c.name.slice(0, 14) + "…" : c.name,
    Total:     c.total_contacts,
    Completed: c.done_contacts,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Analytics</h2>
          <p className="text-sm text-muted-foreground">Performance insights across all campaigns</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Calls"    value={total.toLocaleString()} icon={Phone}       tone="primary"  trend="In selected range" />
        <KpiCard label="Connected"      value={completed}               icon={CheckCircle2} tone="success"  trend={`${connectRate}% connect rate`} />
        <KpiCard label="Avg Duration"   value={formatDuration(avgDur)}  icon={Clock}        tone="default"  trend="Per connected call" />
        <KpiCard label="Connect Rate"   value={`${connectRate}%`}       icon={TrendingUp}   tone="success"  trend="Industry avg: 25%" />
      </div>

      {/* ── Charts row 1 ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily volume */}
        <ChartCard title="Daily Call Volume" loading={loading}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={daily} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.primary}  stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.primary}  stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.success} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={C.success} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke={C.muted} />
              <YAxis tick={{ fontSize: 11 }} stroke={C.muted} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Calls"     stroke={C.primary}  fill="url(#ag1)" strokeWidth={2} />
              <Area type="monotone" dataKey="Connected" stroke={C.success}  fill="url(#ag2)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Connection rate trend */}
        <ChartCard title="Connection Rate (%)" loading={loading}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={daily.map((d) => ({
                day: d.day,
                Rate: d.Calls ? Math.round((d.Connected / d.Calls) * 100) : 0,
              }))}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke={C.muted} />
              <YAxis tick={{ fontSize: 11 }} stroke={C.muted} domain={[0, 100]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
              <Line type="monotone" dataKey="Rate" stroke={C.warning} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Charts row 2 ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Best calling hours */}
        <ChartCard title="Best Calling Hours" loading={loading}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke={C.muted} />
              <YAxis tick={{ fontSize: 10 }} stroke={C.muted} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="calls" fill={C.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Call funnel */}
        <ChartCard title="Call Funnel" loading={loading}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={funnel} layout="vertical" margin={{ top: 4, right: 20, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke={C.muted} />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} stroke={C.muted} width={70} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {funnel.map((_, i) => (
                  <Cell key={i} fill={[C.primary, C.success, C.warning, C.danger][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Campaign performance */}
        <ChartCard title="Campaign Performance" loading={loading}>
          {campBar.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No campaign data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={campBar} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke={C.muted} />
                <YAxis tick={{ fontSize: 10 }} stroke={C.muted} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Total"     fill={C.muted}   radius={[4, 4, 0, 0]} />
                <Bar dataKey="Completed" fill={C.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, loading, children }: { title: string; loading: boolean; children: React.ReactNode }) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[200px] w-full" /> : children}
      </CardContent>
    </Card>
  );
}
