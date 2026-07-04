import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Info, Brain, Mic, Ear, Phone, Key, Upload,
  CalendarClock, ChevronRight, ChevronLeft, Check,
  FileSpreadsheet, X, Eye, EyeOff, Copy, Zap,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { uploadContacts, startCampaign } from "@/lib/api";
import type { UploadPreview } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: "Info",       icon: Info,         title: "Campaign Information" },
  { id: 2, label: "LLM",        icon: Brain,         title: "LLM Configuration" },
  { id: 3, label: "Voice",      icon: Mic,           title: "Voice Configuration" },
  { id: 4, label: "STT",        icon: Ear,           title: "Speech-to-Text" },
  { id: 5, label: "Telephony",  icon: Phone,         title: "Telephony Settings" },
  { id: 6, label: "API Keys",   icon: Key,           title: "API Keys" },
  { id: 7, label: "Leads",      icon: Upload,        title: "Import Leads" },
  { id: 8, label: "Schedule",   icon: CalendarClock, title: "Schedule & Launch" },
];

// ── Default form state ───────────────────────────────────────────────────────
const DEFAULTS = {
  // Step 1
  campaignName: "",
  description: "",
  campaignType: "real_estate",
  notes: "",
  // Step 2
  systemPrompt: `You are an AI outbound sales agent calling property owners on behalf of Premier Property Acquisitions. Be professional, concise, and empathetic. Only reply in English.`,
  welcomeMessage: "Hello! I'm Alex, calling from Premier Property Acquisitions. Do you have a quick moment to chat about your property?",
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 512,
  llmProvider: "groq",
  llmModel: "llama-3.3-70b-versatile",
  memoryEnabled: true,
  // Step 3
  voiceProvider: "elevenlabs",
  voiceModel: "eleven_turbo_v2_5",
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  customVoiceId: "",
  speechSpeed: 1.0,
  stability: 0.5,
  responseDelay: 0.5,
  interruptionsEnabled: true,
  // Step 4
  sttProvider: "deepgram",
  language: "en-US",
  noiseCancellation: true,
  confidence: 0.8,
  endpointDetection: true,
  // Step 5
  telephonyProvider: "livekit_sip",
  callerId: "",
  country: "US",
  concurrentCalls: 1,
  retryAttempts: 1,
  callTimeout: 30,
  voicemailDetection: true,
};

// ── ElevenLabs voices ────────────────────────────────────────────────────────
export const ELEVENLABS_VOICES = [
  // Female
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel",    gender: "F", accent: "American",     style: "Calm" },
  { id: "AZnzlk1XvdvUeBnXmlld", name: "Domi",      gender: "F", accent: "American",     style: "Strong" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",     gender: "F", accent: "American",     style: "Soft" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli",      gender: "F", accent: "American",     style: "Young" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura",     gender: "F", accent: "American",     style: "Upbeat" },
  { id: "jsCqWAovK2LkecY7zXl4", name: "Freya",     gender: "F", accent: "American",     style: "Positive" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica",   gender: "F", accent: "American",     style: "Expressive" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda",   gender: "F", accent: "American",     style: "Warm" },
  { id: "ThT5KcBeYPX3keUQqHPh", name: "Dorothy",   gender: "F", accent: "British",      style: "Warm" },
  { id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte", gender: "F", accent: "British",      style: "Confident" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice",     gender: "F", accent: "British",      style: "Professional" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily",      gender: "F", accent: "British",      style: "Warm" },
  // Male
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam",      gender: "M", accent: "American",     style: "Deep" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni",    gender: "M", accent: "American",     style: "Well-rounded" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",      gender: "M", accent: "American",     style: "Deep" },
  { id: "VR6AewLTigWG4xSOukaG", name: "Arnold",    gender: "M", accent: "American",     style: "Crisp" },
  { id: "yoZ06aMxZJJ28mfd3POQ", name: "Sam",       gender: "M", accent: "American",     style: "Raspy" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will",      gender: "M", accent: "American",     style: "Friendly" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric",      gender: "M", accent: "American",     style: "Friendly" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris",     gender: "M", accent: "American",     style: "Casual" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian",     gender: "M", accent: "American",     style: "Deep" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",    gender: "M", accent: "British",      style: "Deep" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George",    gender: "M", accent: "British",      style: "Warm" },
  { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry",     gender: "M", accent: "British",      style: "Smooth" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum",    gender: "M", accent: "Transatlantic", style: "Intense" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie",   gender: "M", accent: "Australian",   style: "Natural" },
  { id: "D38z5RcWu1voky8WS1ja", name: "Fin",       gender: "M", accent: "Irish",        style: "Calm" },
] as const;

const LLM_MODELS: Record<string, string[]> = {
  groq:       ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
  openai:     ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  anthropic:  ["claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-opus-4-8"],
  gemini:     ["gemini-2.0-flash", "gemini-1.5-pro"],
  deepseek:   ["deepseek-chat", "deepseek-coder"],
  openrouter: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
  custom:     ["custom-model"],
};

export default function CreateCampaign() {
  const [step, setStep]       = useState(1);
  const [form, setForm]       = useState(DEFAULTS);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [dragging, setDragging]   = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"now" | "draft" | "schedule">("now");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const set = (k: keyof typeof DEFAULTS, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length));
  const prev = () => setStep((s) => Math.max(s - 1, 1));

  // ── Lead upload ──────────────────────────────────────────────────────────
  const processFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
      toast.error("Unsupported file", { description: "Upload a .csv or .xlsx file" });
      return;
    }
    setUploading(true);
    setPreview(null);
    try {
      const result = await uploadContacts(file);
      setPreview(result);
      if (result.errors.length) {
        toast.warning(`${result.errors.length} row(s) skipped`, { description: result.errors[0] });
      } else {
        toast.success(`${result.total} contacts imported`);
      }
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  // ── Launch ───────────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (!preview) { toast.error("Please import leads first (Step 7)"); return; }
    if (scheduleMode === "draft") { toast.success("Saved as draft"); navigate("/campaigns"); return; }
    setLaunching(true);
    try {
      await startCampaign(preview.campaign_id);
      toast.success("Campaign launched!", { description: `Calling ${preview.total} contacts` });
      navigate("/campaigns");
    } catch (err) {
      toast.error("Launch failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLaunching(false);
    }
  };

  const currentStep = STEPS[step - 1];

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* ── Step indicator ── */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const done    = step > s.id;
          const current = step === s.id;
          return (
            <div key={s.id} className="flex flex-1 items-center">
              <button
                onClick={() => done && setStep(s.id)}
                className={cn(
                  "flex flex-col items-center gap-1 flex-1 group",
                  done ? "cursor-pointer" : "cursor-default",
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all",
                  done    && "bg-primary border-primary text-primary-foreground",
                  current && "bg-background border-primary text-primary ring-4 ring-primary/20",
                  !done && !current && "bg-muted border-border text-muted-foreground",
                )}>
                  {done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </div>
                <span className={cn(
                  "hidden sm:block text-[10px] font-medium",
                  current ? "text-primary" : done ? "text-foreground" : "text-muted-foreground",
                )}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn("h-0.5 flex-1 -mt-4", step > s.id ? "bg-primary" : "bg-border")} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Step card ── */}
      <Card className="shadow-card">
        <CardContent className="p-6">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <currentStep.icon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Step {step}: {currentStep.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {step} of {STEPS.length} — complete all steps to launch
                </p>
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="min-h-[340px]">
            {step === 1 && <Step1 form={form} set={set} />}
            {step === 2 && <Step2 form={form} set={set} />}
            {step === 3 && <Step3 form={form} set={set} />}
            {step === 4 && <Step4 form={form} set={set} />}
            {step === 5 && <Step5 form={form} set={set} />}
            {step === 6 && <Step6 />}
            {step === 7 && (
              <Step7
                preview={preview}
                uploading={uploading}
                dragging={dragging}
                setDragging={setDragging}
                onDrop={onDrop}
                fileInputRef={fileInputRef}
                onFileChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
                onClear={() => setPreview(null)}
              />
            )}
            {step === 8 && (
              <Step8
                campaignName={form.campaignName}
                preview={preview}
                scheduleMode={scheduleMode}
                setScheduleMode={setScheduleMode}
              />
            )}
          </div>

          {/* Nav */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <Button variant="outline" onClick={prev} disabled={step === 1}>
              <ChevronLeft className="mr-1.5 h-4 w-4" />Back
            </Button>
            {step < STEPS.length ? (
              <Button
                onClick={next}
                disabled={step === 1 && !form.campaignName.trim()}
                className="bg-gradient-primary hover:opacity-95"
              >
                Continue<ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleLaunch}
                disabled={launching || (!preview && scheduleMode !== "draft")}
                className="bg-gradient-primary hover:opacity-95"
              >
                {launching ? "Launching…" :
                  scheduleMode === "draft"    ? "Save Draft" :
                  scheduleMode === "schedule" ? "Schedule Campaign" :
                  "Launch Now"}
                <Zap className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Step 1: Campaign Information ─────────────────────────────────────────────
function Step1({ form, set }: { form: typeof DEFAULTS; set: (k: keyof typeof DEFAULTS, v: unknown) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 space-y-1.5">
        <Label>Campaign Name <span className="text-destructive">*</span></Label>
        <Input
          value={form.campaignName}
          onChange={(e) => set("campaignName", e.target.value)}
          placeholder="e.g. Q3 Property Acquisition Drive"
        />
      </div>
      <div className="sm:col-span-2 space-y-1.5">
        <Label>Description</Label>
        <Textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="What is this campaign about?"
          rows={2}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Campaign Type</Label>
        <Select value={form.campaignType} onValueChange={(v) => set("campaignType", v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="real_estate">Real Estate Acquisition</SelectItem>
            <SelectItem value="lead_gen">Lead Generation</SelectItem>
            <SelectItem value="appointment">Appointment Setting</SelectItem>
            <SelectItem value="survey">Customer Survey</SelectItem>
            <SelectItem value="follow_up">Follow-Up</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Internal notes…" />
      </div>
    </div>
  );
}

// ── Step 2: LLM Configuration ────────────────────────────────────────────────
function Step2({ form, set }: { form: typeof DEFAULTS; set: (k: keyof typeof DEFAULTS, v: unknown) => void }) {
  const models = LLM_MODELS[form.llmProvider] ?? [];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>LLM Provider</Label>
          <Select value={form.llmProvider} onValueChange={(v) => { set("llmProvider", v); set("llmModel", LLM_MODELS[v]?.[0] ?? ""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["groq","openai","anthropic","gemini","deepseek","openrouter","custom"].map((p) => (
                <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Model</Label>
          <Select value={form.llmModel} onValueChange={(v) => set("llmModel", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>System Prompt</Label>
        <Textarea value={form.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} rows={4} className="font-mono text-xs" />
      </div>
      <div className="space-y-1.5">
        <Label>Welcome Message</Label>
        <Textarea value={form.welcomeMessage} onChange={(e) => set("welcomeMessage", e.target.value)} rows={2} />
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        <SliderField label="Temperature" value={form.temperature} min={0} max={1} step={0.1} onChange={(v) => set("temperature", v)} />
        <SliderField label="Top P" value={form.topP} min={0} max={1} step={0.1} onChange={(v) => set("topP", v)} />
        <div className="space-y-1.5">
          <Label>Max Tokens</Label>
          <Input type="number" value={form.maxTokens} onChange={(e) => set("maxTokens", Number(e.target.value))} />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <Switch checked={form.memoryEnabled} onCheckedChange={(v) => set("memoryEnabled", v)} />
        <div>
          <p className="text-sm font-medium">Conversation Memory</p>
          <p className="text-xs text-muted-foreground">Remember context across turns</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Voice Configuration ───────────────────────────────────────────────
const VOICE_MODELS: Record<string, string[]> = {
  elevenlabs: ["eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_monolingual_v1"],
  cartesia:   ["sonic-english", "sonic-multilingual"],
  azure:      ["neural", "standard"],
  google:     ["Wavenet", "Standard", "Neural2"],
  deepgram:   ["aura-asteria-en", "aura-luna-en", "aura-stella-en", "aura-orion-en"],
};

function Step3({ form, set }: { form: typeof DEFAULTS; set: (k: keyof typeof DEFAULTS, v: unknown) => void }) {
  const models = VOICE_MODELS[form.voiceProvider] ?? [];
  const isElevenLabs = form.voiceProvider === "elevenlabs";
  const isCustomVoice = form.voiceId === "__custom__";
  const selectedVoice = ELEVENLABS_VOICES.find((v) => v.id === form.voiceId);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Voice Provider</Label>
          <Select
            value={form.voiceProvider}
            onValueChange={(v) => {
              set("voiceProvider", v);
              set("voiceModel", VOICE_MODELS[v]?.[0] ?? "");
              if (v !== "elevenlabs") set("voiceId", "");
              else set("voiceId", "21m00Tcm4TlvDq8ikWAM");
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["elevenlabs","cartesia","azure","google","deepgram"].map((p) => (
                <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Voice Model</Label>
          <Select value={form.voiceModel} onValueChange={(v) => set("voiceModel", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── ElevenLabs voice selector ── */}
      {isElevenLabs && (
        <div className="space-y-2">
          <Label>Voice Character</Label>
          <Select
            value={form.voiceId}
            onValueChange={(v) => { set("voiceId", v); if (v !== "__custom__") set("customVoiceId", ""); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a voice…">
                {selectedVoice
                  ? `${selectedVoice.name} — ${selectedVoice.style} · ${selectedVoice.accent} ${selectedVoice.gender === "F" ? "Female" : "Male"}`
                  : isCustomVoice ? "Custom Voice ID" : "Select a voice…"}
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

          {/* Show selected voice ID for reference */}
          {selectedVoice && (
            <p className="text-[10px] font-mono text-muted-foreground">
              Voice ID: {selectedVoice.id}
            </p>
          )}

          {/* Custom voice ID input */}
          {isCustomVoice && (
            <Input
              value={form.customVoiceId}
              onChange={(e) => set("customVoiceId", e.target.value)}
              placeholder="Paste your ElevenLabs voice ID here"
              className="font-mono text-xs"
            />
          )}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        <SliderField label="Speech Speed" value={form.speechSpeed} min={0.5} max={2} step={0.1} onChange={(v) => set("speechSpeed", v)} />
        <SliderField label="Stability" value={form.stability} min={0} max={1} step={0.1} onChange={(v) => set("stability", v)} />
        <SliderField label="Response Delay (s)" value={form.responseDelay} min={0} max={2} step={0.1} onChange={(v) => set("responseDelay", v)} />
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <Switch checked={form.interruptionsEnabled} onCheckedChange={(v) => set("interruptionsEnabled", v)} />
        <div>
          <p className="text-sm font-medium">Allow Interruptions</p>
          <p className="text-xs text-muted-foreground">Customer can interrupt the AI mid-sentence</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 4: STT Configuration ─────────────────────────────────────────────────
function Step4({ form, set }: { form: typeof DEFAULTS; set: (k: keyof typeof DEFAULTS, v: unknown) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Speech Provider</Label>
          <Select value={form.sttProvider} onValueChange={(v) => set("sttProvider", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["deepgram","google","azure","assemblyai"].map((p) => (
                <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Language</Label>
          <Select value={form.language} onValueChange={(v) => set("language", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["en-US","en-GB","en-IN","es-ES","fr-FR","de-DE","hi-IN"].map((l) => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <SliderField label="Confidence Threshold" value={form.confidence} min={0} max={1} step={0.05} onChange={(v) => set("confidence", v)} />
      <div className="space-y-2">
        {[
          { key: "noiseCancellation", label: "Noise Cancellation", desc: "Filter background noise from audio" },
          { key: "endpointDetection", label: "Endpoint Detection", desc: "Detect when the customer stops speaking" },
        ].map(({ key, label, desc }) => (
          <div key={key} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <Switch
              checked={form[key as keyof typeof DEFAULTS] as boolean}
              onCheckedChange={(v) => set(key as keyof typeof DEFAULTS, v)}
            />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Step 5: Telephony ─────────────────────────────────────────────────────────
function Step5({ form, set }: { form: typeof DEFAULTS; set: (k: keyof typeof DEFAULTS, v: unknown) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Telephony Provider</Label>
          <Select value={form.telephonyProvider} onValueChange={(v) => set("telephonyProvider", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="livekit_sip">LiveKit SIP</SelectItem>
              <SelectItem value="signalwire">SignalWire</SelectItem>
              <SelectItem value="twilio">Twilio</SelectItem>
              <SelectItem value="plivo">Plivo</SelectItem>
              <SelectItem value="vobiz">Vobiz</SelectItem>
              <SelectItem value="custom_sip">Custom SIP</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Caller ID</Label>
          <Input value={form.callerId} onChange={(e) => set("callerId", e.target.value)} placeholder="+1 (415) 555-0100" />
        </div>
        <div className="space-y-1.5">
          <Label>Country</Label>
          <Select value={form.country} onValueChange={(v) => set("country", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["US","IN","GB","AU","CA"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Retry Attempts</Label>
          <Input type="number" min={0} max={5} value={form.retryAttempts} onChange={(e) => set("retryAttempts", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Concurrent Calls</Label>
          <Input type="number" min={1} max={10} value={form.concurrentCalls} onChange={(e) => set("concurrentCalls", Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label>Call Timeout (s)</Label>
          <Input type="number" min={10} max={120} value={form.callTimeout} onChange={(e) => set("callTimeout", Number(e.target.value))} />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-border p-3">
        <Switch checked={form.voicemailDetection} onCheckedChange={(v) => set("voicemailDetection", v)} />
        <div>
          <p className="text-sm font-medium">Voicemail Detection</p>
          <p className="text-xs text-muted-foreground">Automatically detect voicemail and leave a message</p>
        </div>
      </div>
    </div>
  );
}

// ── Step 6: API Keys ──────────────────────────────────────────────────────────
function Step6() {
  const keys = [
    { label: "Groq API Key",         key: "groq",         placeholder: "gsk_••••••••••••" },
    { label: "OpenAI API Key",        key: "openai",       placeholder: "sk-••••••••••••" },
    { label: "Deepgram API Key",      key: "deepgram",     placeholder: "••••••••••••" },
    { label: "ElevenLabs API Key",    key: "elevenlabs",   placeholder: "••••••••••••" },
    { label: "LiveKit URL",           key: "livekit_url",  placeholder: "wss://your-project.livekit.cloud" },
    { label: "LiveKit API Key",       key: "livekit_key",  placeholder: "API••••••••••" },
    { label: "LiveKit Secret",        key: "livekit_sec",  placeholder: "••••••••••••" },
    { label: "SignalWire Project ID", key: "sw_project",   placeholder: "••••••••••••" },
    { label: "SignalWire Token",      key: "sw_token",     placeholder: "PT••••••••••••" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        These keys are stored in your backend environment variables. Configure them in Settings → API Keys.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {keys.map((k) => (
          <ApiKeyField key={k.key} label={k.label} placeholder={k.placeholder} storageKey={k.key} />
        ))}
      </div>
    </div>
  );
}

function ApiKeyField({ label, placeholder, storageKey }: { label: string; placeholder: string; storageKey: string }) {
  const stored = localStorage.getItem(`apikey_${storageKey}`) ?? "";
  const [value, setValue] = useState(stored);
  const [show, setShow] = useState(false);

  const save = () => {
    localStorage.setItem(`apikey_${storageKey}`, value);
    toast.success("Saved locally");
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Input
            type={show ? "text" : "password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="pr-16 text-xs font-mono"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShow(!show)}>
              {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied"); }}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 text-xs" onClick={save}>Save</Button>
      </div>
    </div>
  );
}

// ── Step 7: Lead Import ───────────────────────────────────────────────────────
function Step7({
  preview, uploading, dragging, setDragging,
  onDrop, fileInputRef, onFileChange, onClear,
}: {
  preview: UploadPreview | null;
  uploading: boolean;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-4">
      {!preview ? (
        <div
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20",
            uploading && "pointer-events-none opacity-50",
          )}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileChange} />
          <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-semibold">{uploading ? "Parsing file…" : "Drop CSV or Excel file here"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Required columns: <code className="rounded bg-muted px-1 py-0.5">name</code> and{" "}
              <code className="rounded bg-muted px-1 py-0.5">phone</code>
            </p>
          </div>
          {!uploading && (
            <Button variant="outline" size="sm" className="pointer-events-none">
              <Upload className="mr-2 h-3.5 w-3.5" />Browse file
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success/5 px-3 py-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-success" />
              <span className="text-sm font-medium">{preview.name}</span>
              <Badge variant="secondary">{preview.total} contacts</Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClear}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {preview.errors.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {preview.errors.length} rows skipped: {preview.errors[0]}
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-lg border text-sm">
            <table className="w-full">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                </tr>
              </thead>
              <tbody>
                {preview.contacts.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-t last:border-b-0">
                    <td className="px-3 py-1.5 text-muted-foreground text-xs">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{c.name}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{c.phone_number}</td>
                  </tr>
                ))}
                {preview.total > 50 && (
                  <tr className="border-t">
                    <td colSpan={3} className="px-3 py-2 text-center text-xs text-muted-foreground">
                      … and {preview.total - 50} more contacts
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 8: Schedule ──────────────────────────────────────────────────────────
function Step8({
  campaignName, preview, scheduleMode, setScheduleMode,
}: {
  campaignName: string;
  preview: UploadPreview | null;
  scheduleMode: "now" | "draft" | "schedule";
  setScheduleMode: (v: "now" | "draft" | "schedule") => void;
}) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-semibold">Campaign Summary</p>
        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          <div><span className="text-muted-foreground">Name: </span><span className="font-medium">{campaignName || "(untitled)"}</span></div>
          <div><span className="text-muted-foreground">Leads: </span><span className="font-medium">{preview ? preview.total : "No file uploaded"}</span></div>
        </div>
        {!preview && (
          <div className="flex items-center gap-1.5 text-xs text-warning">
            <AlertCircle className="h-3.5 w-3.5" />Go back to Step 7 and import leads before launching.
          </div>
        )}
      </div>

      {/* Mode picker */}
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          { id: "now",      label: "Launch Now",      desc: "Start calling immediately", icon: Zap },
          { id: "draft",    label: "Save Draft",      desc: "Save and launch later",     icon: Info },
          { id: "schedule", label: "Schedule",        desc: "Set a future date & time",  icon: CalendarClock },
        ] as const).map(({ id, label, desc, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setScheduleMode(id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all",
              scheduleMode === id
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-primary/40",
            )}
          >
            <Icon className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      {scheduleMode === "schedule" && (
        <div className="grid gap-3 sm:grid-cols-3 rounded-lg border border-border p-4">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" />
          </div>
          <div className="space-y-1.5">
            <Label>Time</Label>
            <Input type="time" />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select defaultValue="UTC">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="UTC">UTC</SelectItem>
                <SelectItem value="America/New_York">US/Eastern</SelectItem>
                <SelectItem value="America/Los_Angeles">US/Pacific</SelectItem>
                <SelectItem value="Asia/Kolkata">IST</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared: Slider field ─────────────────────────────────────────────────────
function SliderField({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
