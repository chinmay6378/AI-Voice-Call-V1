import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Radio, Phone, PhoneOff, Clock, User, Bot,
  RefreshCw, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { LiveCallPanel } from "@/components/LiveCallPanel";
import { StartCallCard } from "@/components/StartCallCard";
import { getActiveCall, listCalls } from "@/lib/api";
import type { Call } from "@/lib/mock-data";
import { formatDate } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default function LiveCalls() {
  const [recentCalls, setRecentCalls] = useState<Call[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([getActiveCall(), listCalls()]).then(([active, calls]) => {
      setActiveCallId(active?.id ?? null);
      setRecentCalls(
        calls
          .filter((c) => ["connected", "dialing", "ringing"].includes(c.status))
          .concat(calls.filter((c) => !["connected", "dialing", "ringing"].includes(c.status)))
          .slice(0, 10),
      );
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 5000);
    return () => clearInterval(interval);
  }, []);

  const liveCount = recentCalls.filter((c) =>
    ["connected", "dialing", "ringing"].includes(c.status)
  ).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            liveCount > 0 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
          )}>
            <Radio className="h-4.5 w-4.5" style={{ height: "18px", width: "18px" }} />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              Live Calls
              {liveCount > 0 && (
                <Badge className="border-success/30 bg-success/10 text-success text-[10px]">
                  <span className="mr-1 h-1.5 w-1.5 rounded-full bg-success animate-pulse inline-block" />
                  {liveCount} active
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">Real-time call monitoring</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-4 w-4" />Refresh
        </Button>
      </div>

      {/* ── Main grid ── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Left: start call + live panel */}
        <div className="space-y-4">
          <StartCallCard
            activeCallId={activeCallId}
            onStarted={(id) => { setActiveCallId(id); load(); }}
          />
          <LiveCallPanel
            active={!!activeCallId}
            callId={activeCallId}
            onCallEnded={() => { setActiveCallId(null); load(); }}
          />
        </div>

        {/* Right: call list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent & Active Calls</h3>
            <Button variant="ghost" size="sm" className="text-xs" asChild>
              <Link to="/results">Full history <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map((i) => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : recentCalls.length === 0 ? (
            <Card className="shadow-card">
              <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <PhoneOff className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No active calls right now</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentCalls.map((c) => (
                <CallRow key={c.id} call={c} />
              ))}
            </div>
          )}

          {/* System status strip */}
          <Card className="shadow-card mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Agent Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "LiveKit Agent Worker", status: "online",  detail: "voice-call-agent · READY" },
                { label: "Deepgram STT",         status: "online",  detail: "nova-2 · en-US" },
                { label: "Groq LLM",             status: "online",  detail: "llama-3.3-70b-versatile" },
                { label: "ElevenLabs TTS",       status: "online",  detail: "eleven_turbo_v2_5" },
              ].map(({ label, status, detail }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "h-2 w-2 rounded-full",
                      status === "online" ? "bg-success animate-pulse" : "bg-destructive",
                    )} />
                    <span className="font-medium">{label}</span>
                  </div>
                  <span className="text-muted-foreground font-mono">{detail}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CallRow({ call: c }: { call: Call }) {
  const isLive = ["connected", "dialing", "ringing"].includes(c.status);
  return (
    <Link to={`/calls/${c.id}`}>
      <div className={cn(
        "flex items-center gap-3 rounded-xl border p-3 transition-all hover:shadow-sm",
        isLive ? "border-primary/30 bg-primary/5" : "border-border bg-card",
      )}>
        {/* Avatar */}
        <div className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          isLive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}>
          {isLive ? <Phone className="h-4 w-4 animate-pulse" /> : c.customerName.charAt(0)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{c.customerName}</p>
            <StatusBadge status={c.status} />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground">{c.phoneNumber}</p>
        </div>

        {/* Right */}
        <div className="text-right shrink-0">
          <p className="text-[10px] text-muted-foreground">{formatDate(c.date)}</p>
          {isLive && (
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] text-success font-medium">LIVE</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
