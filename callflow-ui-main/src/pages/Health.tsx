import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getHealth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Service = { name: string; description: string; status: string; latency: string };

export default function Health() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getHealth().then((s) => {
      setServices([...s]);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const allHealthy = services.every((s) => s.status === "healthy");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">System Health</h2>
          <p className="text-sm text-muted-foreground">Realtime status of platform dependencies.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { load(); toast.success("Health refreshed"); }}>
          <Activity className="mr-1.5 h-4 w-4" /> Refresh
        </Button>
      </div>

      {!loading && (
        <div className={cn(
          "flex items-center gap-2 rounded-lg border p-3 text-sm",
          allHealthy ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive",
        )}>
          {allHealthy ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span className="font-medium">
            {allHealthy ? "All systems operational" : "One or more services are degraded"}
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : services.map((s) => (
            <Card key={s.name} className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{s.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    s.status === "healthy" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
                  )}>
                    {s.status === "healthy" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium capitalize",
                    s.status === "healthy"
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-destructive/30 bg-destructive/10 text-destructive",
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.status === "healthy" ? "bg-success" : "bg-destructive")} />
                    {s.status}
                  </span>
                  <span className="font-mono text-muted-foreground">{s.latency}</span>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}