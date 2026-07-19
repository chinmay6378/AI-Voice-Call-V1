import { useNavigate } from "react-router-dom";
import { Eye, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, formatDuration, type Call } from "@/lib/mock-data";

interface Props {
  calls: Call[];
  loading?: boolean;
  compact?: boolean;
}

export function CallsTable({ calls, loading, compact }: Props) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Card className="p-4 shadow-card">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!calls.length) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center shadow-card">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <PhoneOff className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">No calls yet</p>
        <p className="text-xs text-muted-foreground">Start your first outbound call to see it here.</p>
      </Card>
    );
  }

  const rows = compact ? calls.slice(0, 5) : calls;

  return (
    <Card className="shadow-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Call ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/call-details/${c.id}`)}>
              <TableCell className="font-mono text-xs">{c.id}</TableCell>
              <TableCell className="font-medium">{c.customerName}</TableCell>
              <TableCell className="text-muted-foreground">{c.phoneNumber}</TableCell>
              <TableCell><StatusBadge status={c.status} /></TableCell>
              <TableCell className="tabular-nums">{formatDuration(c.duration)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(c.date)}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/call-details/${c.id}`); }}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}