import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PhoneIncoming, Copy, Check, Save, RefreshCw,
  Eye, ChevronDown, ChevronRight, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { getInboundConfig, saveInboundConfig, listInboundCalls, type InboundConfig } from "@/lib/api";
import type { Call } from "@/lib/mock-data";
import { formatDate, formatDuration } from "@/lib/mock-data";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Inbound() {
  const navigate  = useNavigate();
  const defaultConfig: InboundConfig = {
    inbound_enabled: "false",
    inbound_phone_number: "",
    inbound_agent_name: "",
    inbound_company_name: "",
    inbound_greeting: "",
    inbound_system_prompt: "",
    inbound_livekit_trunk_id: "",
    webhook_url: "",
  };

  const [config, setConfig]     = useState<InboundConfig>(defaultConfig);
  const [calls, setCalls]       = useState<Call[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [copied, setCopied]     = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    Promise.all([
      getInboundConfig().catch(() => defaultConfig),
      listInboundCalls().catch(() => []),
    ]).then(([cfg, c]) => { setConfig(cfg); setCalls(c); })
      .finally(() => setLoading(false));
  }, []);

  const copyWebhook = () => {
    if (!config.webhook_url) return;
    navigator.clipboard.writeText(config.webhook_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Webhook URL copied");
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveInboundConfig(config);
      toast.success("Inbound settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof InboundConfig, value: string) =>
    setConfig((prev) => ({ ...prev, [key]: value }));

  const enabled = config.inbound_enabled === "true";

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
          )}>
            <PhoneIncoming className="h-4.5 w-4.5" style={{ height: "18px", width: "18px" }} />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Inbound Calls</h2>
            <p className="text-sm text-muted-foreground">
              AI agent answers incoming calls on your SignalWire number
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={enabled}
              onCheckedChange={(v) => set("inbound_enabled", v ? "true" : "false")}
            />
            <span className="text-sm font-medium">{enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {/* ── Webhook URL ── */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Webhook URL
            <Badge variant="outline" className="text-[10px] font-mono">POST</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={config.webhook_url}
              className="font-mono text-xs bg-muted/40"
            />
            <Button variant="outline" size="icon" onClick={copyWebhook}>
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste this URL in your SignalWire phone number's Voice &amp; Fax settings as the "When a Call Comes In" webhook.
          </p>

          {/* Setup instructions collapsible */}
          <button
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            onClick={() => setShowSetup((v) => !v)}
          >
            {showSetup ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            How to set this up
          </button>
          {showSetup && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">Setup checklist</p>
              <ol className="list-decimal list-inside space-y-2">
                <li>In <strong>LiveKit Cloud</strong> → SIP → create an <strong>Inbound SIP Trunk</strong> pointing to your SignalWire DID.</li>
                <li>Create a <strong>Dispatch Rule</strong> (Individual) so each call gets its own room. Copy the trunk ID and paste it in the field below.</li>
                <li>In <strong>SignalWire</strong> → Phone Numbers → your DID → Voice settings → set "When a Call Comes In" to <em>Webhook</em> and paste the URL above.</li>
                <li>Enable inbound handling using the toggle above and hit <strong>Save</strong>.</li>
              </ol>
              <div className="flex items-start gap-1.5 mt-2 rounded bg-primary/5 border border-primary/20 p-2">
                <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <span>
                  The <strong>LiveKit SIP URI</strong> (in Settings → LiveKit SIP URI) must be set to your LiveKit SIP domain,
                  e.g. <span className="font-mono">sip.livekit.io</span>. The webhook connects the caller to
                  <span className="font-mono"> sip:room-name@your-sip-domain</span>.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Agent configuration ── */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Agent Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Your Phone Number (DID)</Label>
              <Input
                placeholder="+15551234567"
                value={config.inbound_phone_number}
                onChange={(e) => set("inbound_phone_number", e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">Informational — the SignalWire number customers call</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">LiveKit Inbound Trunk ID</Label>
              <Input
                placeholder="ST_xxxxxxxxxxxxxxxx"
                value={config.inbound_livekit_trunk_id}
                onChange={(e) => set("inbound_livekit_trunk_id", e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">From LiveKit Cloud → SIP → Inbound Trunks</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Agent Name</Label>
              <Input
                value={config.inbound_agent_name}
                onChange={(e) => set("inbound_agent_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Company Name</Label>
              <Input
                value={config.inbound_company_name}
                onChange={(e) => set("inbound_company_name", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Opening Greeting</Label>
            <Input
              value={config.inbound_greeting}
              onChange={(e) => set("inbound_greeting", e.target.value)}
              placeholder="Thank you for calling {company_name}. My name is {agent_name}..."
            />
            <p className="text-[10px] text-muted-foreground">
              Use <span className="font-mono">{"{agent_name}"}</span> and <span className="font-mono">{"{company_name}"}</span> as placeholders
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">System Prompt</Label>
            <Textarea
              rows={5}
              value={config.inbound_system_prompt}
              onChange={(e) => set("inbound_system_prompt", e.target.value)}
              placeholder="You are a helpful AI assistant answering inbound calls..."
              className="resize-none text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Inbound call history ── */}
      <Card className="shadow-card overflow-hidden">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent Inbound Calls</CardTitle>
          <Badge variant="outline">{calls.length} total</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {calls.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <PhoneIncoming className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No inbound calls yet</p>
              <p className="text-xs text-muted-foreground">Calls will appear here once customers start calling</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Caller</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calls.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/calls/${c.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            <PhoneIncoming className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium font-mono">{c.phoneNumber}</p>
                            <p className="text-[10px] text-muted-foreground">{c.id.slice(0, 8)}…</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><StatusBadge status={c.status} /></TableCell>
                      <TableCell className="tabular-nums text-sm">{formatDuration(c.duration)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(c.date)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="text-xs" onClick={() => navigate(`/calls/${c.id}`)}>
                          <Eye className="mr-1.5 h-3.5 w-3.5" />View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
