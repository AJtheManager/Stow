import { ApiError, apiFetch } from "@/lib/api";
import { buildActivityQuery, type ActivityFilters } from "@/lib/activity";

const CSV_MIME_TYPE = "text/csv;charset=utf-8";

export interface ExportProgress {
  /** Bytes of the CSV received so far. */
  bytesReceived: number;
}

export interface DownloadTransactionsOptions {
  /** Called as the CSV streams in, so large exports can show progress. */
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}

/** `stow-transactions-YYYY-MM-DD.csv`, dated in UTC like the server's export. */
export function buildExportFilename(now: Date = new Date()): string {
  return `stow-transactions-${now.toISOString().slice(0, 10)}.csv`;
}

/** Compact human-readable size, e.g. `1.2 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * Reads the response body, reporting progress per chunk. Falls back to
 * `blob()` where the body isn't streamable.
 */
async function readCsv(
  response: Response,
  onProgress?: (progress: ExportProgress) => void,
): Promise<Blob> {
  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    onProgress?.({ bytesReceived: blob.size });
    return new Blob([blob], { type: CSV_MIME_TYPE });
  }

  const chunks: Uint8Array[] = [];
  let bytesReceived = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytesReceived += value.byteLength;
    onProgress?.({ bytesReceived });
  }
  return new Blob(chunks as BlobPart[], { type: CSV_MIME_TYPE });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads the address's transaction history as a CSV file, applying the
 * same date-range/type filters as the activity timeline. The file has the
 * account address and export date up top, then one row per transaction with
 * date, type, amount and balance.
 *
 * The export is never truncated to the timeline's page size, and progress is
 * reported while it streams in so large exports don't look stalled.
 */
export async function downloadTransactionsCsv(
  address: string,
  filters: ActivityFilters = {},
  { onProgress, signal }: DownloadTransactionsOptions = {},
): Promise<void> {
  const query = buildActivityQuery(address, { ...filters, limit: undefined });
  const response = await apiFetch(`/api/savings/activity/export?${query}`, {
    signal,
  });

  if (!response.ok) {
    throw new ApiError(
      `Failed to export transactions: ${response.statusText}`,
      response.status,
    );
  }

  const blob = await readCsv(response, onProgress);
  triggerDownload(blob, buildExportFilename());
}
