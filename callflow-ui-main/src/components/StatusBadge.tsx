import { cn } from "@/lib/utils";
import type { CallStatus } from "@/lib/mock-data";

type AnyStatus = CallStatus | string;

const styles: Record<string, string> = {
  queued:      "bg-muted text-muted-foreground border-border",
  pending:     "bg-muted text-muted-foreground border-border",
  dialing:     "bg-accent text-accent-foreground border-accent",
  ringing:     "bg-warning/15 text-warning border-warning/30",
  connected:   "bg-primary/10 text-primary border-primary/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  completed:   "bg-success/15 text-success border-success/30",
  voicemail:   "bg-warning/15 text-warning border-warning/30",
  no_answer:   "bg-muted/60 text-muted-foreground border-border",
  busy:        "bg-muted/60 text-muted-foreground border-border",
  failed:      "bg-destructive/10 text-destructive border-destructive/30",
  cancelled:   "bg-muted text-muted-foreground border-border",
};

const dotStyles: Record<string, string> = {
  completed:   "bg-success",
  voicemail:   "bg-warning",
  no_answer:   "bg-muted-foreground",
  busy:        "bg-muted-foreground",
  failed:      "bg-destructive",
  connected:   "bg-primary animate-pulse",
  in_progress: "bg-primary animate-pulse",
  ringing:     "bg-warning animate-pulse",
  dialing:     "bg-accent-foreground",
  queued:      "bg-muted-foreground",
  pending:     "bg-muted-foreground",
  cancelled:   "bg-muted-foreground",
};

const LABELS: Record<string, string> = {
  no_answer: "No Answer",
  in_progress: "In Progress",
};

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const label = LABELS[status] ?? status.replace(/_/g, " ");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[status] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[status] ?? "bg-muted-foreground")} />
      {label}
    </span>
  );
}
