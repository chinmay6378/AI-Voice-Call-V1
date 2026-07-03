import { useEffect, useState } from "react";
import { Phone, PhoneCall, PhoneOff, CheckCircle2 } from "lucide-react";
import { KpiCard } from "@/components/KpiCard";
import { StartCallCard } from "@/components/StartCallCard";
import { LiveCallPanel } from "@/components/LiveCallPanel";
import { BulkCallCard } from "@/components/BulkCallCard";
import { CampaignPanel } from "@/components/CampaignPanel";
import { CallsTable } from "@/components/CallsTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listCalls, getActiveCall, listCampaigns } from "@/lib/api";
import type { Call } from "@/lib/mock-data";
import type { Campaign } from "@/lib/api";

export default function Index() {
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);

  const load = () => {
    listCalls().then((data) => {
      setCalls(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    getActiveCall().then((active) => {
      if (active) setActiveCallId(active.id);
    });
    listCampaigns().then((campaigns) => {
      const running = campaigns.find((c) => c.status === "running");
      if (running) setActiveCampaign(running);
    });
    load();
  }, []);

  const kpis = {
    totalCalls: calls.length,
    activeCalls: calls.filter((c) => ["connected", "dialing", "ringing"].includes(c.status)).length,
    completedCalls: calls.filter((c) => c.status === "completed").length,
    failedCalls: calls.filter((c) => c.status === "failed").length,
  };

  const handleCallEnded = () => {
    setActiveCallId(null);
    load();
  };

  const handleCampaignStarted = (campaign: Campaign) => {
    setActiveCampaign(campaign);
  };

  const handleCampaignDone = () => {
    setActiveCampaign(null);
    load();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Calls" value={kpis.totalCalls.toLocaleString()} icon={Phone} tone="primary" trend="All time" />
        <KpiCard label="Active Calls" value={kpis.activeCalls} icon={PhoneCall} tone="warning" trend="Live now" />
        <KpiCard label="Completed" value={kpis.completedCalls.toLocaleString()} icon={CheckCircle2} tone="success" trend={kpis.totalCalls ? `${Math.round((kpis.completedCalls / kpis.totalCalls) * 100)}% success rate` : "—"} />
        <KpiCard label="Failed" value={kpis.failedCalls} icon={PhoneOff} tone="destructive" trend={kpis.totalCalls ? `${Math.round((kpis.failedCalls / kpis.totalCalls) * 100)}% failure rate` : "—"} />
      </div>

      <Tabs defaultValue="single">
        <TabsList className="mb-4">
          <TabsTrigger value="single">Single Call</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Campaign</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <StartCallCard
                activeCallId={activeCallId}
                onStarted={(id) => { setActiveCallId(id); load(); }}
              />
            </div>
            <LiveCallPanel active={!!activeCallId} callId={activeCallId} onCallEnded={handleCallEnded} />
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {activeCampaign ? (
                <CampaignPanel
                  campaign={activeCampaign}
                  onStopped={handleCampaignDone}
                  onCompleted={handleCampaignDone}
                />
              ) : (
                <BulkCallCard
                  onCampaignStarted={handleCampaignStarted}
                  activeCampaignId={activeCampaign ? (activeCampaign as Campaign).id : null}
                />
              )}
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground space-y-2">
                <p className="font-medium text-foreground">CSV / Excel format</p>
                <p>Your file must have two columns:</p>
                <pre className="rounded bg-muted px-3 py-2 text-xs">
{`name,phone
John Doe,+1234567891
Jane Smith,+919876543210`}
                </pre>
                <p>Phone numbers must include country code (e.g. +91 for India).</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Recent Calls</h2>
        </div>
        <CallsTable calls={calls} loading={loading} compact />
      </div>
    </div>
  );
}
