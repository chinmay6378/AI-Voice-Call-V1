import { useState } from "react";
import { PhoneCall, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { startCall } from "@/lib/api";

interface Props {
  activeCallId?: string | null;
  onStarted: (callId: string) => void;
}

export function StartCallCard({ activeCallId, onStarted }: Props) {
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [propertyType, setPropertyType] = useState("Single Family");
  const [promptId, setPromptId] = useState("real-estate-acquisition");
  const [loading, setLoading] = useState(false);

  const isBlocked = !!activeCallId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !phoneNumber) {
      toast.error("Missing information", { description: "Enter customer name and phone number." });
      return;
    }
    if (isBlocked) {
      toast.error("Call already active", { description: `End call ${activeCallId?.slice(0, 8)}… before starting a new one.` });
      return;
    }
    setLoading(true);
    try {
      const res = await startCall({ customerName, phoneNumber, propertyType, promptId });
      toast.success("Call started", { description: `Dialing ${phoneNumber}…` });
      onStarted(res.callId);
      setCustomerName("");
      setPhoneNumber("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start call";
      const is409 = msg.toLowerCase().includes("already active") || msg.includes("409");
      toast.error(is409 ? "Call already in progress" : "Failed to start call", {
        description: is409 ? "End the current call first, then try again." : msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Start Call</CardTitle>
      </CardHeader>
      <CardContent>
        {isBlocked && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Call <span className="font-mono">{activeCallId?.slice(0, 8)}…</span> is active. End it before starting a new one.</span>
          </div>
        )}
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cust">Customer Name</Label>
            <Input
              id="cust"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Marcus Reynolds"
              disabled={isBlocked}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+12345678901"
              disabled={isBlocked}
            />
          </div>
          <div className="space-y-2">
            <Label>Property Type</Label>
            <Select value={propertyType} onValueChange={setPropertyType} disabled={isBlocked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Single Family">Single Family</SelectItem>
                <SelectItem value="Multi Family">Multi Family</SelectItem>
                <SelectItem value="Condo">Condo</SelectItem>
                <SelectItem value="Land">Land</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Prompt</Label>
            <Select value={promptId} onValueChange={setPromptId} disabled={isBlocked}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="real-estate-acquisition">Real Estate Acquisition</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              size="lg"
              className="w-full bg-gradient-primary shadow-elegant hover:opacity-95"
              disabled={loading || isBlocked}
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
              {isBlocked ? "Call In Progress…" : "Start Call"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
