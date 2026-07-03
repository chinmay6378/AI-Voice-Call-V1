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

export const mockCalls: Call[] = [
  {
    id: "CL-10248",
    customerName: "Marcus Reynolds",
    phoneNumber: "+1 (415) 555-0142",
    propertyType: "Single Family",
    status: "completed",
    duration: 342,
    date: "2026-07-03T14:22:00Z",
    summary:
      "Homeowner expressed strong interest in a cash offer for their 3BR property. Estimated value discussed at $685K. Scheduled follow-up walkthrough for July 8.",
    transcript: [
      { speaker: "ai", text: "Hi Marcus, this is Ava from Meridian Acquisitions. Do you have a quick moment to talk about your property on Oak Street?", ts: "00:02" },
      { speaker: "customer", text: "Sure, what's this about?", ts: "00:08" },
      { speaker: "ai", text: "We're actively acquiring single family homes in your neighborhood and I'd love to see if a cash offer would make sense for you.", ts: "00:12" },
      { speaker: "customer", text: "I've actually been considering selling. What kind of numbers are you seeing?", ts: "00:22" },
      { speaker: "ai", text: "Comparable homes have been closing between $650K and $700K. Would you be open to a no-obligation walkthrough this week?", ts: "00:35" },
      { speaker: "customer", text: "Yeah let's do it. How about Wednesday?", ts: "00:48" },
    ],
    events: [
      { ts: "14:22:00", type: "system", message: "Call initiated via Twilio" },
      { ts: "14:22:03", type: "dial", message: "Dialing +1 (415) 555-0142" },
      { ts: "14:22:11", type: "ring", message: "Ringing" },
      { ts: "14:22:18", type: "connect", message: "Customer answered" },
      { ts: "14:27:42", type: "hangup", message: "Call ended normally" },
    ],
    timeline: [
      { state: "queued", ts: "14:21:58" },
      { state: "dialing", ts: "14:22:03" },
      { state: "ringing", ts: "14:22:11" },
      { state: "connected", ts: "14:22:18" },
      { state: "completed", ts: "14:27:42" },
    ],
  },
  {
    id: "CL-10247",
    customerName: "Priya Shah",
    phoneNumber: "+1 (206) 555-0198",
    propertyType: "Condo",
    status: "connected",
    duration: 87,
    date: "2026-07-03T14:18:00Z",
  },
  {
    id: "CL-10246",
    customerName: "Devon Carter",
    phoneNumber: "+1 (312) 555-0177",
    propertyType: "Multi Family",
    status: "failed",
    duration: 0,
    date: "2026-07-03T13:55:00Z",
  },
  {
    id: "CL-10245",
    customerName: "Sofia Alvarez",
    phoneNumber: "+1 (713) 555-0163",
    propertyType: "Land",
    status: "completed",
    duration: 512,
    date: "2026-07-03T13:41:00Z",
  },
  {
    id: "CL-10244",
    customerName: "Jamal Whitfield",
    phoneNumber: "+1 (404) 555-0121",
    propertyType: "Single Family",
    status: "completed",
    duration: 268,
    date: "2026-07-03T13:12:00Z",
  },
  {
    id: "CL-10243",
    customerName: "Elena Petrova",
    phoneNumber: "+1 (617) 555-0155",
    propertyType: "Condo",
    status: "failed",
    duration: 0,
    date: "2026-07-03T12:48:00Z",
  },
  {
    id: "CL-10242",
    customerName: "Wesley Chen",
    phoneNumber: "+1 (503) 555-0189",
    propertyType: "Single Family",
    status: "completed",
    duration: 401,
    date: "2026-07-03T12:20:00Z",
  },
];

export const kpis = {
  totalCalls: 1284,
  activeCalls: 3,
  completedCalls: 1102,
  failedCalls: 179,
};

export const healthServices = [
  { name: "Backend API", description: "FastAPI orchestration service", status: "healthy", latency: "42ms" },
  { name: "LiveKit", description: "Realtime media transport", status: "healthy", latency: "68ms" },
  { name: "Deepgram", description: "Speech-to-text transcription", status: "healthy", latency: "112ms" },
  { name: "Groq", description: "LLM inference for dialogue", status: "healthy", latency: "89ms" },
  { name: "ElevenLabs", description: "Text-to-speech synthesis", status: "unhealthy", latency: "timeout" },
  { name: "Telephony Provider", description: "SignalWire outbound trunk", status: "healthy", latency: "51ms" },
] as const;

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