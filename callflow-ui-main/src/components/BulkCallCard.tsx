import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet, X, Play, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { uploadContacts, startCampaign } from "@/lib/api";
import type { Campaign, UploadPreview } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  onCampaignStarted: (campaign: Campaign) => void;
  activeCampaignId?: string | null;
}

export function BulkCallCard({ onCampaignStarted, activeCampaignId }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        toast.success(`${result.total} contacts loaded`);
      }
    } catch (err) {
      toast.error("Upload failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setUploading(false);
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    []
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleStart = async () => {
    if (!preview) return;
    setStarting(true);
    try {
      const campaign = await startCampaign(preview.campaign_id);
      toast.success("Campaign started", { description: `Calling ${preview.total} contacts one by one` });
      setPreview(null);
      onCampaignStarted(campaign);
    } catch (err) {
      toast.error("Failed to start", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setStarting(false);
    }
  };

  const isBlocked = !!activeCampaignId;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bulk Call Campaign</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isBlocked && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>A campaign is already running. Stop it before starting a new one.</span>
          </div>
        )}

        {/* Drop zone */}
        {!preview && (
          <div
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
              (uploading || isBlocked) && "pointer-events-none opacity-50"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !uploading && !isBlocked && inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileChange} />
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                {uploading ? "Parsing file…" : "Drop CSV or Excel file here"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Required columns: <code className="rounded bg-muted px-1">name</code> and{" "}
                <code className="rounded bg-muted px-1">phone</code>
              </p>
            </div>
            {!uploading && (
              <Button variant="outline" size="sm" className="pointer-events-none">
                <Upload className="mr-2 h-3.5 w-3.5" />
                Browse file
              </Button>
            )}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{preview.name}</span>
                <Badge variant="secondary">{preview.total} contacts</Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setPreview(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Contact preview table */}
            <div className="max-h-52 overflow-y-auto rounded-md border text-sm">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.contacts.slice(0, 100).map((c, i) => (
                    <tr key={i} className="border-t last:border-b-0">
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5 font-medium">{c.name}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{c.phone_number}</td>
                    </tr>
                  ))}
                  {preview.total > 100 && (
                    <tr className="border-t">
                      <td colSpan={3} className="px-3 py-2 text-center text-xs text-muted-foreground">
                        … and {preview.total - 100} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Button
              className="w-full bg-gradient-primary shadow-elegant hover:opacity-95"
              onClick={handleStart}
              disabled={starting || isBlocked}
            >
              <Play className="mr-2 h-4 w-4" />
              {starting ? "Starting…" : `Start Campaign — ${preview.total} calls`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
