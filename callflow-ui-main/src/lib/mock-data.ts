export type CallStatus = "queued" | "dialing" | "ringing" | "connected" | "completed" | "failed";

export const CALL_STATES: CallStatus[] = ["queued", "dialing", "ringing", "connected", "completed"];

export interface Call {
  id: string;
  customerName: string;
  phoneNumber: string;
  propertyType: "Single Family" | "Multi Family" | "Condo" | "Land";
  status: CallStatus;
  duration: number; // seconds
  date: string; // ISO
  summary?: string;
  transcript?: { speaker: "ai" | "customer"; text: string; ts: string }[];
  events?: { ts: string; type: string; message: string }[];
  timeline?: { state: CallStatus; ts: string }[];
}

export function formatDuration(seconds: number) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}