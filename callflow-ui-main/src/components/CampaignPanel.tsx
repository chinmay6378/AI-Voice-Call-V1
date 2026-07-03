import { useEffect, useRef, useState } from "react";
import { Square, Phone, CheckCircle2, XCircle, Clock, PhoneMissed, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getCampaign, stopCampaign } from "@/lib/api";
import type { Campaign, CampaignContact } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  campaign: Campaign;
  onStopped: () => void;
  onCompleted: () => void;
}

const TERMINAL = new Set(["completed", "stopped"]);

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  calling:   <Phone className="h-3.5 w-3.5 text-primary animate-pulse" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  failed:    <XCircle className="h-3.5 w-3.5 text-destructive" />,
  no_answer: <PhoneMissed className="h-3.5 w-3.5 text-orange-400" />,
  busy:      <PhoneOff className="h-3.5 w-3.5 text-yellow-500" />,
};

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pending",
  calling:   "Calling…",
  completed: "Completed",
  failed:    "Failed",
  no_answer: "No Answer",
  busy:      "Busy",
};

function ContactRow({ contact, current }: { contact: CampaignContact; current: boolean }) {
  return (
    <tr className={cn("border-t last:border-b-0 transition-colors", current && "bg-primary/5")}>
      <td className="px-3 py-1.5 text-muted-foreground text-xs">{contact.order_index + 1}</td>
      <td className="px-3 py-1.5 font-medium text-sm">{contact.name}</td>
      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{contact.phone_number}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          {STATUS_ICON[contact.status] ?? <Clock className="h-3.5 w-3.5" />}
          <span className="text-xs">{STATUS_LABEL[contact.status] ?? contact.status}</span>
        </div>
      </td>
    </tr>
  );
}

export function CampaignPanel({ campaign: initial, onStopped, onCompleted }: Props) {
  const [campaign, setCampaign] = useState<Campaign>(initial);
  const [stopping, setStopping] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => {
    if (TERMINAL.has(campaign.status)) return;

    const poll = async () => {
      try {
        const updated = await getCampaign(campaign.id);
        setCampaign(updated);
        if (updated.status === "completed") {
          stopPolling();
          toast.success("Campaign completed", { description: `All ${updated.total_contacts} contacts called` });
          onCompleted();
        } else if (updated.status === "stopped") {
          stopPolling();
          onStopped();
        }
      } catch {
        // silently retry
      }
    };

    poll();
    pollRef.current = setInterval(poll, 3000);
    return stopPolling;
  }, [campaign.id, campaign.status]);

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopCampaign(campaign.id);
      toast.info("Campaign stopped");
      stopPolling();
      onStopped();
    } catch {
      toast.error("Failed to stop campaign");
    } finally {
      setStopping(false);
    }
  };

  const progress = campaign.total_contacts
    ? Math.round((campaign.done_contacts / campaign.total_contacts) * 100)
    : 0;

  const callingContact = campaign.contacts.find((c) => c.status === "calling");
  const done = campaign.done_contacts;
  const total = campaign.total_contacts;
  const isDone = TERMINAL.has(campaign.status);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Campaign Progress</CardTitle>
          <Badge
            variant={
              campaign.status === "completed" ? "default" :
              campaign.status === "stopped" ? "secondary" :
              "outline"
            }
          >
            {campaign.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{campaign.name}</span>
            <span>{done} / {total}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Current call indicator */}
        {callingContact && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <Phone className="h-4 w-4 text-primary animate-pulse shrink-0" />
            <span>Calling <strong>{callingContact.name}</strong> ({callingContact.phone_number})</span>
          </div>
        )}

        {/* Contact list */}
        <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Phone</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaign.contacts.map((c) => (
                <ContactRow key={c.id} contact={c} current={c.status === "calling"} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Stop button */}
        {!isDone && (
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={handleStop}
            disabled={stopping}
          >
            <Square className="mr-2 h-3.5 w-3.5" />
            {stopping ? "Stopping…" : "Stop Campaign"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
