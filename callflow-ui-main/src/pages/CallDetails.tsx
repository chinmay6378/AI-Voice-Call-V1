import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bot, User, Clock, PhoneOff, VoicemailIcon, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { getCall } from "@/lib/api";
import { formatDate, formatDuration, type Call } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export default function CallDetails() {
  const { id = "" } = useParams();
  const [call, setCall] = useState<Call | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCall(id).then((c) => {
      setCall(c);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!call) return <p className="text-muted-foreground">Call not found.</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/calls"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{call.customerName}</h2>
              <StatusBadge status={call.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground">{call.id} · {call.phoneNumber}</p>
          </div>
        </div>
      </div>

      {/* ── Machine / voicemail / error banners ── */}
      {call.status === "voicemail" && (
        <div className="flex items-center gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
          <VoicemailIcon className="h-4 w-4 shrink-0" />
          <span><strong>Voicemail detected.</strong> Agent left a voicemail message and ended the call.</span>
        </div>
      )}
      {call.status === "no_answer" && (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <PhoneOff className="h-4 w-4 shrink-0" />
          <span><strong>IVR / Machine detected.</strong> Agent detected an automated system and ended the call.</span>
        </div>
      )}
      {call.status === "failed" && call.errorMessage && (
        <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><strong>Error:</strong> {call.errorMessage}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <MetaTile label="Property" value={call.propertyType} />
        <MetaTile label="Duration" value={formatDuration(call.duration)} />
        <MetaTile label="Date" value={formatDate(call.date)} />
        <MetaTile label="Prompt" value="Real Estate Acquisition" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transcript</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {call.transcript?.length ? call.transcript.map((t, i) => (
              <div key={i} className={cn("flex gap-2.5", t.speaker === "ai" ? "" : "flex-row-reverse")}>
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  t.speaker === "ai" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}>
                  {t.speaker === "ai" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                  t.speaker === "ai"
                    ? "bg-primary text-primary-foreground rounded-tl-sm"
                    : "bg-muted text-foreground rounded-tr-sm",
                )}>
                  {t.text}
                  <div className={cn("mt-1 text-[10px] opacity-70", t.speaker === "ai" ? "" : "text-right")}>{t.ts}</div>
                </div>
              </div>
            )) : <EmptyBlock label="No transcript available for this call." />}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">AI Summary</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {call.summary ?? "Summary will appear here once the call completes."}
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="pb-3"><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
            <CardContent>
              {call.timeline?.length ? (
                <ol className="relative space-y-3 border-l border-border pl-4">
                  {call.timeline.map((t, i) => (
                    <li key={i} className="relative">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                      <div className="text-xs font-medium capitalize">{t.state}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{t.ts}</div>
                    </li>
                  ))}
                </ol>
              ) : <EmptyBlock label="No state changes recorded." />}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3"><CardTitle className="text-base">Event Log</CardTitle></CardHeader>
        <CardContent>
          {call.events?.length ? (
            <div className="space-y-1.5 font-mono text-xs">
              {call.events.map((e, i) => (
                <div key={i} className="flex gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5">
                  <span className="text-muted-foreground">{e.ts}</span>
                  <span className="uppercase text-primary">{e.type}</span>
                  <span>{e.message}</span>
                </div>
              ))}
            </div>
          ) : <EmptyBlock label="No events logged." />}
        </CardContent>
      </Card>
    </div>
  );
}

function MetaTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-medium">{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5" /> {label}
    </div>
  );
}