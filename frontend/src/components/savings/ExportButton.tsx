"use client";

import { useCallback, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import type { ActivityFilters } from "@/lib/activity";
import { downloadTransactionsCsv, formatBytes } from "@/lib/exportTransactions";

export interface ExportButtonProps {
  /** Wallet address whose transactions are exported; the button is disabled without one. */
  address: string | null;
  /** Date range / type filters applied to the export. */
  filters?: ActivityFilters;
  disabled?: boolean;
}

/**
 * "Export CSV" button for the transaction history. Downloads the filtered
 * history, showing how much has been received while a large export streams
 * in, and surfaces failures inline.
 */
export default function ExportButton({
  address,
  filters = {},
  disabled = false,
}: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [bytesReceived, setBytesReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    if (!address) return;
    setIsExporting(true);
    setBytesReceived(0);
    setError(null);
    try {
      await downloadTransactionsCsv(address, filters, {
        onProgress: ({ bytesReceived }) => setBytesReceived(bytesReceived),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to export transactions",
      );
    } finally {
      setIsExporting(false);
    }
  }, [address, filters]);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleExport}
        disabled={!address || isExporting || disabled}
        aria-busy={isExporting}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card/70 focus:outline-none focus:ring-2 focus:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        Export CSV
      </button>

      {isExporting && (
        <p
          role="status"
          data-testid="export-progress"
          className="text-xs text-muted"
        >
          {bytesReceived > 0
            ? `Exporting… ${formatBytes(bytesReceived)} received`
            : "Preparing export…"}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500"
        >
          {error}
        </p>
      )}
    </div>
  );
}
