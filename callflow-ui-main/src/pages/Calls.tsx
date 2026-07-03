import { useEffect, useState } from "react";
import { CallsTable } from "@/components/CallsTable";
import { listCalls } from "@/lib/api";
import type { Call } from "@/lib/mock-data";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw } from "lucide-react";

export default function Calls() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = () => {
    setLoading(true);
    listCalls().then((c) => {
      setCalls(c);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = calls.filter(
    (c) =>
      c.customerName.toLowerCase().includes(q.toLowerCase()) ||
      c.phoneNumber.includes(q) ||
      c.id.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">All Calls</h2>
          <p className="text-sm text-muted-foreground">Every outbound call across your workspace.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search calls…" className="pl-8" />
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <CallsTable calls={filtered} loading={loading} />
    </div>
  );
}
