import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function Settings() {
  const [provider, setProvider] = useState("SignalWire");
  const [apiBase, setApiBase] = useState("https://api.voxreach.dev");
  const [webhook, setWebhook] = useState("https://api.voxreach.dev/webhooks/telephony");

  const save = () => toast.success("Settings saved", { description: "Configuration stored locally (mock)." });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Workspace-wide configuration for the voice calling platform.</p>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Telephony</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SignalWire">SignalWire</SelectItem>
                <SelectItem value="Vobiz">Vobiz</SelectItem>
                <SelectItem value="Twilio">Twilio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Caller ID</Label>
            <Input placeholder="+1 (415) 555-0100" defaultValue="+1 (415) 555-0100" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Webhook URL</Label>
            <Input value={webhook} onChange={(e) => setWebhook(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">API</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Backend Base URL</Label>
            <Input value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
            <p className="text-xs text-muted-foreground">Placeholder for FastAPI backend. Endpoints: POST /call/start, GET /calls, GET /calls/{"{id}"}, GET /health.</p>
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input type="password" placeholder="sk_live_••••••••••••" />
          </div>
          <div className="space-y-2">
            <Label>Request Timeout (ms)</Label>
            <Input type="number" defaultValue={15000} />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Future Integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { name: "CRM Sync (Salesforce, HubSpot)", desc: "Push call outcomes into your CRM automatically." },
            { name: "Slack Notifications", desc: "Notify a channel when high-intent leads convert." },
            { name: "Webhook Fan-out", desc: "Deliver events to multiple downstream systems." },
          ].map((f) => (
            <div key={f.name} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
              <Switch disabled />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} className="bg-gradient-primary shadow-elegant hover:opacity-95">Save changes</Button>
      </div>
    </div>
  );
}