import { useEffect, useState } from "react";
import { Eye, EyeOff, Copy, Check, Zap, Save, Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getConfiguredKeys, getHealth, saveConfigKey } from "@/lib/api";
import { ELEVENLABS_VOICES } from "@/pages/CreateCampaign";

// ── API key field ─────────────────────────────────────────────────────────────
function ApiKeyRow({
  label, storageKey, placeholder, hint, backendKey, serverValue,
}: {
  label: string; storageKey: string; placeholder?: string; hint?: string;
  backendKey?: string; serverValue?: string;
}) {
  const [value, setValue]   = useState(localStorage.getItem(`cfg_${storageKey}`) ?? "");
  const [show, setShow]     = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [saving, setSaving] = useState(false);

  // Sync from server once the parent loads keys
  useEffect(() => {
    if (serverValue !== undefined && serverValue !== "") {
      setValue(serverValue);
      localStorage.setItem(`cfg_${storageKey}`, serverValue);
    }
  }, [serverValue, storageKey]);

  const save = async () => {
    localStorage.setItem(`cfg_${storageKey}`, value);
    if (!backendKey) { toast.success(`${label} saved`); return; }
    setSaving(true);
    try {
      await saveConfigKey(backendKey, value);
      toast.success(`${label} saved to server`);
    } catch {
      toast.warning(`${label} saved locally (server unreachable)`);
    } finally {
      setSaving(false);
    }
  };
  const copy = () => { navigator.clipboard.writeText(value); toast.success("Copied"); };
  const test = async () => {
    setStatus("idle");
    try {
      await getHealth();
      setStatus("ok");
      toast.success("Connection OK");
    } catch {
      setStatus("err");
      toast.error("Connection failed");
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {status === "ok"  && <Badge className="text-[10px] border-success/30 bg-success/5 text-success" variant="outline">Connected</Badge>}
        {status === "err" && <Badge className="text-[10px] border-destructive/30 bg-destructive/5 text-destructive" variant="outline">Failed</Badge>}
      </div>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder ?? "••••••••••••"}
            className="pr-14 font-mono text-xs"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShow(!show)}>
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={test} className="shrink-0 text-xs">
          <Zap className="mr-1 h-3 w-3" />Test
        </Button>
        <Button size="sm" onClick={save} disabled={saving} className="shrink-0 text-xs">
          <Save className="mr-1 h-3 w-3" />{saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── ElevenLabs voice picker ───────────────────────────────────────────────────
function ElevenLabsVoicePicker({ serverValue }: { serverValue?: string }) {
  const STORAGE_KEY = "cfg_elevenlabs_voice";
  const saved = localStorage.getItem(STORAGE_KEY) ?? "21m00Tcm4TlvDq8ikWAM";
  const [voiceId, setVoiceId] = useState(saved);
  const [customId, setCustomId] = useState("");

  // Sync from server once keys load
  useEffect(() => {
    if (serverValue && serverValue !== "") {
      setVoiceId(serverValue);
      localStorage.setItem(STORAGE_KEY, serverValue);
    }
  }, [serverValue]);

  const isCustom = voiceId === "__custom__";
  const selected = ELEVENLABS_VOICES.find((v) => v.id === voiceId);

  const save = async (id: string) => {
    const effectiveId = id === "__custom__" ? customId : id;
    localStorage.setItem(STORAGE_KEY, effectiveId);
    try {
      await saveConfigKey("elevenlabs_voice_id", effectiveId);
      toast.success("Voice saved to server");
    } catch {
      toast.warning("Voice saved locally (server unreachable)");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5" />ElevenLabs Voice
        </Label>
        {selected && (
          <span className="text-[10px] font-mono text-muted-foreground">{selected.id}</span>
        )}
      </div>
      <Select
        value={voiceId}
        onValueChange={(v) => { setVoiceId(v); if (v !== "__custom__") save(v); }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a voice…">
            {selected
              ? `${selected.name} — ${selected.style} · ${selected.accent} ${selected.gender === "F" ? "Female" : "Male"}`
              : isCustom ? "Custom Voice ID" : "Select a voice…"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {ELEVENLABS_VOICES.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              <div className="flex items-center gap-2">
                <span className="font-medium w-20">{v.name}</span>
                <span className="text-xs text-muted-foreground">{v.style} · {v.accent} {v.gender === "F" ? "Female" : "Male"}</span>
              </div>
            </SelectItem>
          ))}
          <SelectItem value="__custom__">
            <span className="text-muted-foreground italic">Custom Voice ID…</span>
          </SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <div className="flex gap-1.5">
          <Input
            value={customId}
            onChange={(e) => setCustomId(e.target.value)}
            placeholder="Paste ElevenLabs voice ID"
            className="font-mono text-xs"
          />
          <Button size="sm" onClick={() => save("__custom__")} className="shrink-0 text-xs">
            <Save className="mr-1 h-3 w-3" />Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function SettingsSection({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Settings() {
  const [telephonyProvider, setTelephonyProvider] = useState("livekit_sip");
  const [theme, setTheme]                         = useState("system");
  const [notifEnabled, setNotifEnabled]           = useState(true);
  const [serverKeys, setServerKeys]               = useState<Record<string, string>>({});

  useEffect(() => {
    getConfiguredKeys().then(setServerKeys).catch(() => {});
  }, []);

  const sv = (key: string) => serverKeys[key];

  const save = () => toast.success("Settings saved");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Tabs defaultValue="general">
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          {["general","llm","voice","stt","telephony","api-keys","security","notifications"].map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize text-xs">
              {t.replace("-", " ")}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── General ── */}
        <TabsContent value="general" className="space-y-4">
          <SettingsSection title="General" description="Platform-wide settings">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Platform Name</Label>
                <Input defaultValue="Smart Acquisition Solutions" />
              </div>
              <div className="space-y-1.5">
                <Label>Backend URL</Label>
                <Input defaultValue={import.meta.env.VITE_API_BASE_URL ?? "/api"} />
              </div>
              <div className="space-y-1.5">
                <Label>Theme</Label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select defaultValue="UTC">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">US/Eastern</SelectItem>
                    <SelectItem value="America/Los_Angeles">US/Pacific</SelectItem>
                    <SelectItem value="Asia/Kolkata">IST (India)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── LLM Providers ── */}
        <TabsContent value="llm" className="space-y-4">
          <SettingsSection title="LLM Providers" description="Configure language model API keys">
            <div className="space-y-4">
              <ApiKeyRow label="Groq API Key"        storageKey="groq_key"       backendKey="groq_api_key"     serverValue={sv("groq_api_key")}     placeholder="gsk_••••••••••••" hint="Used for llama-3.3-70b-versatile and other Groq models" />
              <ApiKeyRow label="OpenAI API Key"       storageKey="openai_key"     placeholder="sk-••••••••••••" />
              <ApiKeyRow label="Anthropic API Key"    storageKey="anthropic_key"  placeholder="sk-ant-••••••••" />
              <ApiKeyRow label="Gemini API Key"       storageKey="gemini_key"     placeholder="AIza••••••••••••" />
              <ApiKeyRow label="DeepSeek API Key"     storageKey="deepseek_key"   placeholder="sk-••••••••••••" />
              <ApiKeyRow label="OpenRouter API Key"   storageKey="openrouter_key" placeholder="sk-or-••••••••••••" />
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── Voice Providers ── */}
        <TabsContent value="voice" className="space-y-4">
          <SettingsSection title="Voice (TTS) Providers" description="Text-to-speech API credentials">
            <div className="space-y-4">
              <ApiKeyRow label="ElevenLabs API Key" storageKey="elevenlabs_key" backendKey="elevenlabs_api_key" serverValue={sv("elevenlabs_api_key")} placeholder="••••••••••••" />
              <div className="border-t border-border pt-4">
                <ElevenLabsVoicePicker serverValue={sv("elevenlabs_voice_id")} />
              </div>
              <div className="border-t border-border pt-4 space-y-4">
                <ApiKeyRow label="Azure Speech Key"  storageKey="azure_speech_key" placeholder="••••••••••••" />
                <ApiKeyRow label="Google Cloud Key"  storageKey="google_tts_key"   placeholder="••••••••••••" />
              </div>
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── STT Providers ── */}
        <TabsContent value="stt" className="space-y-4">
          <SettingsSection title="Speech-to-Text Providers" description="Transcription API credentials">
            <div className="space-y-4">
              <ApiKeyRow label="Deepgram API Key"     storageKey="deepgram_key"   backendKey="deepgram_api_key" serverValue={sv("deepgram_api_key")} placeholder="••••••••••••" hint="Used for nova-2 real-time transcription" />
              <ApiKeyRow label="AssemblyAI API Key"   storageKey="assemblyai_key" placeholder="••••••••••••" />
              <ApiKeyRow label="Azure Speech Key"     storageKey="azure_stt_key"  placeholder="••••••••••••" />
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── Telephony ── */}
        <TabsContent value="telephony" className="space-y-4">
          <SettingsSection title="Telephony Configuration" description="SIP trunk and calling provider settings">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Active Provider</Label>
                  <Select value={telephonyProvider} onValueChange={setTelephonyProvider}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="livekit_sip">LiveKit SIP</SelectItem>
                      <SelectItem value="signalwire">SignalWire</SelectItem>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="plivo">Plivo</SelectItem>
                      <SelectItem value="vobiz">Vobiz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Caller ID</Label>
                  <Input placeholder="+1 (415) 555-0100" />
                </div>
              </div>
              <div className="border-t border-border pt-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LiveKit SIP</p>
                <ApiKeyRow label="LiveKit URL"        storageKey="livekit_url"          backendKey="livekit_url"          serverValue={sv("livekit_url")}          placeholder="wss://project.livekit.cloud" />
                <ApiKeyRow label="LiveKit API Key"    storageKey="livekit_api_key"      backendKey="livekit_api_key"      serverValue={sv("livekit_api_key")} />
                <ApiKeyRow label="LiveKit API Secret" storageKey="livekit_api_secret"   backendKey="livekit_api_secret"   serverValue={sv("livekit_api_secret")} />
                <ApiKeyRow label="SIP Trunk ID"       storageKey="livekit_sip_trunk_id" backendKey="livekit_sip_trunk_id" serverValue={sv("livekit_sip_trunk_id")} />
              </div>
              {telephonyProvider === "signalwire" && (
                <div className="border-t border-border pt-4 space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SignalWire</p>
                  <ApiKeyRow label="Project ID"    storageKey="sw_project_id"  backendKey="signalwire_project_id" serverValue={sv("signalwire_project_id")} />
                  <ApiKeyRow label="API Token"     storageKey="sw_api_token"   backendKey="signalwire_api_token"  serverValue={sv("signalwire_api_token")} />
                  <ApiKeyRow label="Space URL"     storageKey="sw_space_url"   backendKey="signalwire_space_url"  serverValue={sv("signalwire_space_url")}  placeholder="yourspace.signalwire.com" />
                  <ApiKeyRow label="From Number"   storageKey="sw_from_number" backendKey="signalwire_from_number" serverValue={sv("signalwire_from_number")} placeholder="+1 (415) 555-0100" />
                </div>
              )}
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── API Keys (all-in-one) ── */}
        <TabsContent value="api-keys" className="space-y-4">
          <SettingsSection title="All API Keys" description="Quick access to all provider credentials">
            <div className="grid gap-4 sm:grid-cols-2">
              <ApiKeyRow label="Groq"               storageKey="groq_key"           backendKey="groq_api_key"          serverValue={sv("groq_api_key")} />
              <ApiKeyRow label="OpenAI"             storageKey="openai_key" />
              <ApiKeyRow label="Deepgram"           storageKey="deepgram_key"       backendKey="deepgram_api_key"      serverValue={sv("deepgram_api_key")} />
              <ApiKeyRow label="ElevenLabs"         storageKey="elevenlabs_key"     backendKey="elevenlabs_api_key"    serverValue={sv("elevenlabs_api_key")} />
              <ApiKeyRow label="LiveKit URL"        storageKey="livekit_url"        backendKey="livekit_url"           serverValue={sv("livekit_url")} />
              <ApiKeyRow label="LiveKit Key"        storageKey="livekit_api_key"    backendKey="livekit_api_key"       serverValue={sv("livekit_api_key")} />
              <ApiKeyRow label="LiveKit Secret"     storageKey="livekit_api_secret" backendKey="livekit_api_secret"    serverValue={sv("livekit_api_secret")} />
              <ApiKeyRow label="SignalWire Project" storageKey="sw_project_id"      backendKey="signalwire_project_id" serverValue={sv("signalwire_project_id")} />
              <ApiKeyRow label="SignalWire Token"   storageKey="sw_api_token"       backendKey="signalwire_api_token"  serverValue={sv("signalwire_api_token")} />
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── Security ── */}
        <TabsContent value="security" className="space-y-4">
          <SettingsSection title="Security" description="Authentication and access control">
            <div className="space-y-4">
              {[
                { label: "Require Authentication",       desc: "Protect dashboard behind login",    key: "auth" },
                { label: "Two-Factor Authentication",    desc: "Enable 2FA for admin accounts",    key: "2fa" },
                { label: "API Request Signing",          desc: "Sign outbound webhook requests",   key: "signing" },
                { label: "Audit Log",                    desc: "Log all admin actions",            key: "audit" },
              ].map(({ label, desc, key }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch defaultChecked={key === "auth"} />
                </div>
              ))}
            </div>
          </SettingsSection>
        </TabsContent>

        {/* ── Notifications ── */}
        <TabsContent value="notifications" className="space-y-4">
          <SettingsSection title="Notifications" description="Configure alerts and webhooks">
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Enable Notifications</p>
                  <p className="text-xs text-muted-foreground">Receive alerts for important events</p>
                </div>
                <Switch checked={notifEnabled} onCheckedChange={setNotifEnabled} />
              </div>
              {notifEnabled && (
                <>
                  {[
                    { label: "Campaign Completed",  key: "n_campaign_done" },
                    { label: "Call Failed",         key: "n_call_failed" },
                    { label: "High-Intent Lead",    key: "n_interested" },
                    { label: "Agent Offline",       key: "n_agent_offline" },
                  ].map(({ label, key }) => (
                    <div key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                      <p className="text-sm">{label}</p>
                      <Switch defaultChecked />
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label>Webhook URL</Label>
                    <Input placeholder="https://your-server.com/webhook" />
                    <p className="text-xs text-muted-foreground">POST events to this URL in real time</p>
                  </div>
                </>
              )}
            </div>
          </SettingsSection>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={save} className="bg-gradient-primary shadow-elegant hover:opacity-95">
          <Check className="mr-2 h-4 w-4" />Save Changes
        </Button>
      </div>
    </div>
  );
}
