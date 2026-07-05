import type { Call, CallStatus } from "./mock-data";
import { formatDuration, formatDate } from "./mock-data";

export { formatDuration, formatDate };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

// ── Backend response types ────────────────────────────────────────────────────

interface BackendCall {
  call_id: string;
  customer_name: string;
  phone_number: string;
  status: string;
  created_at: string;
  start_time: string | null;
  answer_time: string | null;
  end_time: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  livekit_room_name: string | null;
}

interface BackendTranscript {
  call_id: string;
  customer_name: string;
  status: string;
  transcript: { role: string; text: string; timestamp: string }[];
  summary: string | null;
}

interface BackendLog {
  call_id: string;
  logs: { event: string; timestamp: string; [k: string]: unknown }[];
}

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, CallStatus> = {
  pending: "queued",
  dialing: "dialing",
  ringing: "ringing",
  in_progress: "connected",
  voicemail: "completed",
  completed: "completed",
  failed: "failed",
  no_answer: "failed",
  busy: "failed",
  cancelled: "failed",
};

// ── Transform helpers ─────────────────────────────────────────────────────────

function toRelativeTs(baseIso: string, iso: string): string {
  const delta = Math.max(0, Math.floor((new Date(iso).getTime() - new Date(baseIso).getTime()) / 1000));
  const m = Math.floor(delta / 60);
  const s = delta % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function toWallClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false });
}

function toCall(r: BackendCall): Call {
  return {
    id: r.call_id,
    customerName: r.customer_name,
    phoneNumber: r.phone_number,
    propertyType: "Single Family",
    status: STATUS_MAP[r.status] ?? "failed",
    duration: r.duration_seconds ?? 0,
    date: r.created_at,
  };
}

function applyTranscript(call: Call, t: BackendTranscript): Call {
  const base = t.transcript[0]?.timestamp ?? call.date;
  call.transcript = t.transcript.map((entry) => ({
    speaker: entry.role === "agent" ? "ai" : "customer",
    text: entry.text,
    ts: toRelativeTs(base, entry.timestamp),
  }));
  call.summary = t.summary ?? undefined;
  return call;
}

function applyLogs(call: Call, l: BackendLog): Call {
  call.events = l.logs.map((log) => ({
    ts: toWallClock(log.timestamp),
    type: String(log.event).split(".").pop() ?? log.event,
    message: log.event,
  }));
  return call;
}

function buildTimeline(r: BackendCall): Call["timeline"] {
  const tl: { state: CallStatus; ts: string }[] = [];
  tl.push({ state: "queued", ts: toWallClock(r.created_at) });
  if (r.start_time) tl.push({ state: "dialing", ts: toWallClock(r.start_time) });
  if (r.answer_time) tl.push({ state: "connected", ts: toWallClock(r.answer_time) });
  if (r.end_time) {
    const finalStatus = STATUS_MAP[r.status] ?? "completed";
    tl.push({ state: finalStatus, ts: toWallClock(r.end_time) });
  }
  return tl;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function startCall(payload: {
  customerName: string;
  phoneNumber: string;
  propertyType: string;
  promptId: string;
}): Promise<{ callId: string }> {
  const res = await fetch(`${API_BASE}/call/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_name: payload.customerName,
      phone_number: payload.phoneNumber,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Failed to start call");
  }
  const data = await res.json();
  return { callId: data.call_id };
}

export async function endCall(callId: string): Promise<void> {
  await fetch(`${API_BASE}/call/end/${callId}`, { method: "POST" });
}

export async function listCalls(): Promise<Call[]> {
  const res = await fetch(`${API_BASE}/calls`);
  if (!res.ok) throw new Error("Failed to fetch calls");
  const data: BackendCall[] = await res.json();
  return data.map(toCall);
}

export async function getCall(id: string): Promise<Call | undefined> {
  const [statusRes, transcriptRes, logsRes] = await Promise.all([
    fetch(`${API_BASE}/call/status/${id}`),
    fetch(`${API_BASE}/call/transcript/${id}`),
    fetch(`${API_BASE}/call/logs/${id}`),
  ]);

  if (!statusRes.ok) return undefined;

  const backendCall: BackendCall = await statusRes.json();
  const call = toCall(backendCall);
  call.timeline = buildTimeline(backendCall);

  if (transcriptRes.ok) {
    const t: BackendTranscript = await transcriptRes.json();
    applyTranscript(call, t);
  }
  if (logsRes.ok) {
    const l: BackendLog = await logsRes.json();
    applyLogs(call, l);
  }

  return call;
}

export async function getActiveCall(): Promise<Call | null> {
  const res = await fetch(`${API_BASE}/calls/active`);
  if (!res.ok) return null;
  const data: BackendCall | null = await res.json();
  return data ? toCall(data) : null;
}

export async function getCallStatus(id: string): Promise<{ status: string; raw: BackendCall } | null> {
  const res = await fetch(`${API_BASE}/call/status/${id}`);
  if (!res.ok) return null;
  const data: BackendCall = await res.json();
  return { status: data.status, raw: data };
}

// ── Bulk campaign API ─────────────────────────────────────────────────────────

export interface CampaignContact {
  id: string;
  order_index: number;
  name: string;
  phone_number: string;
  status: string;
  call_id: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  status: string;
  total_contacts: number;
  done_contacts: number;
  created_at: string;
  contacts: CampaignContact[];
}

export interface UploadPreview {
  campaign_id: string;
  name: string;
  total: number;
  contacts: { name: string; phone_number: string }[];
  errors: string[];
}

export async function uploadContacts(file: File): Promise<UploadPreview> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/bulk/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = typeof err.detail === "object" ? err.detail.message : err.detail;
    throw new Error(detail ?? "Upload failed");
  }
  return res.json();
}

export async function startCampaign(campaignId: string): Promise<Campaign> {
  const res = await fetch(`${API_BASE}/bulk/campaigns/${campaignId}/start`, { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Failed to start campaign");
  }
  return res.json();
}

export async function stopCampaign(campaignId: string): Promise<Campaign> {
  const res = await fetch(`${API_BASE}/bulk/campaigns/${campaignId}/stop`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to stop campaign");
  return res.json();
}

export async function getCampaign(campaignId: string): Promise<Campaign> {
  const res = await fetch(`${API_BASE}/bulk/campaigns/${campaignId}`);
  if (!res.ok) throw new Error("Campaign not found");
  return res.json();
}

export async function listCampaigns(): Promise<Campaign[]> {
  const res = await fetch(`${API_BASE}/bulk/campaigns`);
  if (!res.ok) throw new Error("Failed to fetch campaigns");
  return res.json();
}

export function getCallsExportUrl(): string {
  return `${API_BASE}/calls/export`;
}

export function getCampaignExportUrl(campaignId: string): string {
  return `${API_BASE}/bulk/campaigns/${campaignId}/export`;
}

export async function getHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("Health check failed");
  const data = await res.json();
  return (data.services ?? []) as { name: string; description: string; status: string; latency: string }[];
}

// ── Settings persistence ──────────────────────────────────────────────────────

export async function getConfiguredKeys(): Promise<Record<string, string>> {
  const res = await fetch(`${API_BASE}/settings/keys`);
  if (!res.ok) return {};
  return res.json();
}

export async function saveConfigKey(key: string, value: string): Promise<void> {
  const res = await fetch(`${API_BASE}/settings/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Failed to save setting");
  }
}
