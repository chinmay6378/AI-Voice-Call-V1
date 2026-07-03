import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { getCallStatus, endCall } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Check, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";

interface Props {
  active: boolean;
  callId?: string | null;
  onCallEnded?: () => void;
}

// Matches actual backend status flow — no phantom "ringing" step
const STEPS = ["queued", "dialing", "connected", "completed"] as const;
type Step = (typeof STEPS)[number];

const BACKEND_TO_STEP: Record<string, Step> = {
  pending:     "queued",
  dialing:     "dialing",
  ringing:     "dialing",   // backend rarely emits this, treat same as dialing
  in_progress: "connected",
  voicemail:   "completed",
  completed:   "completed",
  failed:      "completed",
  no_answer:   "completed",
  busy:        "completed",
  cancelled:   "completed",
};

const TERMINAL = new Set(["completed", "voicemail", "failed", "no_answer", "busy", "cancelled"]);

export function LiveCallPanel({ active, callId, onCallEnded }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rawStatus, setRawStatus] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [offline, setOffline] = useState(false);
  const startedAt = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCount = useRef(0);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  useEffect(() => {
    if (!active || !callId) {
      stopPolling();
      setStepIdx(0);
      setRawStatus(null);
      setElapsed(0);
      setIsDone(false);
      startedAt.current = null;
      return;
    }

    setStepIdx(0);
    setRawStatus("pending");
    setIsDone(false);
    setOffline(false);
    failCount.current = 0;
    startedAt.current = Date.now();

    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000));
    }, 1000);

    const poll = async () => {
      let result;
      try {
        result = await getCallStatus(callId);
      } catch {
        // network error — backend may be restarting, silently retry
        result = null;
      }
      if (!result) {
        failCount.current += 1;
        if (failCount.current >= 3) setOffline(true);
        return;
      }
      failCount.current = 0;
      setOffline(false);

      const step = BACKEND_TO_STEP[result.status] ?? "queued";
      const idx = STEPS.indexOf(step);
      setStepIdx(idx >= 0 ? idx : 0);
      setRawStatus(result.status);

      if (TERMINAL.has(result.status)) {
        stopPolling();
        setIsDone(true);
        // Show final state for 4 seconds so user sees completed/failed
        setTimeout(() => onCallEnded?.(), 4000);
      }
    };

    poll();
    pollRef.current = setInterval(poll, 2000);

    return stopPolling;
  }, [active, callId]);

  const handleEndCall = async () => {
    if (!callId) return;
    setEnding(true);
    try {
      await endCall(callId);
      toast.success("Call ended");
      stopPolling();
      setIsDone(true);
      setTimeout(() => onCallEnded?.(), 2000);
    } catch {
      toast.error("Failed to end call");
    } finally {
      setEnding(false);
    }
  };

  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const statusColor = rawStatus === "failed" || rawStatus === "no_answer" || rawStatus === "busy"
    ? "text-destructive"
    : rawStatus === "completed" || rawStatus === "voicemail"
    ? "text-success"
    : "text-muted-foreground";

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Live Call Status</span>
          {callId && <span className="font-mono text-xs text-muted-foreground">{callId.slice(0, 8)}…</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!active ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Phone className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No active call</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start a call to see live state updates here.
            </p>
          </div>
        ) : (
          <>
            <div className="relative flex items-center justify-center py-4">
              <div className="relative">
                <div className={cn("absolute inset-0 rounded-full bg-primary/30", !isDone && "animate-pulse-ring")} />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary shadow-elegant">
                  <Phone className="h-6 w-6 text-primary-foreground" />
                </div>
              </div>
            </div>

            <div className="text-center font-mono text-sm text-muted-foreground">
              {formatElapsed(elapsed)}
            </div>

            <Progress value={progress} className="h-1.5" />

            <div className="flex items-center justify-between gap-1">
              {STEPS.map((s, i) => {
                const done = i < stepIdx;
                const isCurrent = i === stepIdx;
                return (
                  <div key={s} className="flex flex-1 flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                        done && "bg-success text-success-foreground border-success",
                        isCurrent && "bg-primary text-primary-foreground border-primary ring-4 ring-primary/20",
                        !done && !isCurrent && "bg-muted text-muted-foreground border-border",
                      )}
                    >
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-medium uppercase tracking-wider",
                        isCurrent ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>

            {!isDone && (
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={handleEndCall}
                disabled={ending}
              >
                <PhoneOff className="mr-2 h-4 w-4" />
                {ending ? "Ending…" : "End Call"}
              </Button>
            )}

            {offline && (
              <p className="text-center font-mono text-[10px] uppercase tracking-widest text-destructive">
                backend offline — retrying…
              </p>
            )}
            {!offline && rawStatus && (
              <p className={cn("text-center font-mono text-[10px] uppercase tracking-widest", statusColor)}>
                {rawStatus.replace(/_/g, " ")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
