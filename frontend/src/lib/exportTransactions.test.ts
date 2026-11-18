import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildExportFilename,
  downloadTransactionsCsv,
  formatBytes,
} from "./exportTransactions";
import { apiFetch, ApiError } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch: vi.fn(),
}));

const ADDRESS = "GABC123";

const CSV = [
  "Account address,GABC123",
  "Export date,2026-11-18 09:30:15 UTC",
  "",
  "date,type,amount,amount_stroops,balance,balance_stroops",
  "2026-11-12 08:05:09 UTC,withdrawal,1.5000000,15000000,8.5000000,85000000",
  "2026-11-10 12:00:00 UTC,deposit,10.0000000,100000000,10.0000000,100000000",
].join("\r\n");

/** jsdom's Blob has no `.text()`. */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function csvResponse(chunks: string[] = [CSV]): Response {
  return new Response(streamOf(chunks), {
    status: 200,
    headers: { "Content-Type": "text/csv" },
  });
}

describe("exportTransactions", () => {
  let downloaded: { blob: Blob; filename: string }[];
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    downloaded = [];

    let pendingBlob: Blob | null = null;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      pendingBlob = blob;
      return "blob:mock";
    });
    URL.revokeObjectURL = vi.fn();
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloaded.push({ blob: pendingBlob!, filename: this.download });
      });
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  describe("downloadTransactionsCsv", () => {
    it("downloads the exported CSV with every transaction intact", async () => {
      vi.mocked(apiFetch).mockResolvedValue(csvResponse());

      await downloadTransactionsCsv(ADDRESS);

      expect(downloaded).toHaveLength(1);
      expect(await readBlobText(downloaded[0].blob)).toBe(CSV);
      expect(downloaded[0].blob.type).toBe("text/csv;charset=utf-8");
    });

    it("triggers the download automatically and cleans up", async () => {
      vi.mocked(apiFetch).mockResolvedValue(csvResponse());

      await downloadTransactionsCsv(ADDRESS);

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
      expect(document.querySelector("a[download]")).toBeNull();
    });

    it("names the file with the export date", async () => {
      vi.mocked(apiFetch).mockResolvedValue(csvResponse());

      await downloadTransactionsCsv(ADDRESS);

      expect(downloaded[0].filename).toBe(buildExportFilename());
      expect(downloaded[0].filename).toMatch(
        /^stow-transactions-\d{4}-\d{2}-\d{2}\.csv$/,
      );
    });

    it("requests the export endpoint for the address", async () => {
      vi.mocked(apiFetch).mockResolvedValue(csvResponse());

      await downloadTransactionsCsv(ADDRESS);

      const url = String(vi.mocked(apiFetch).mock.calls[0][0]);
      expect(url.startsWith("/api/savings/activity/export?")).toBe(true);
      expect(new URLSearchParams(url.split("?")[1]).get("address")).toBe(
        ADDRESS,
      );
    });

    it("respects the filtered date range and types", async () => {
      vi.mocked(apiFetch).mockResolvedValue(csvResponse());

      await downloadTransactionsCsv(ADDRESS, {
        from: "2026-11-01",
        to: "2026-11-30",
        types: ["deposit", "withdrawal"],
      });

      const params = new URLSearchParams(
        String(vi.mocked(apiFetch).mock.calls[0][0]).split("?")[1],
      );
      expect(new Date(params.get("from")!).getTime()).toBe(
        new Date("2026-11-01T00:00:00").getTime(),
      );
      expect(new Date(params.get("to")!).getTime()).toBe(
        new Date("2026-11-30T23:59:59.999").getTime(),
      );
      expect(params.get("types")).toBe("deposit,withdrawal");
    });

    it("never truncates the export to the timeline page size", async () => {
      vi.mocked(apiFetch).mockResolvedValue(csvResponse());

      await downloadTransactionsCsv(ADDRESS, { limit: 100 });

      const params = new URLSearchParams(
        String(vi.mocked(apiFetch).mock.calls[0][0]).split("?")[1],
      );
      expect(params.has("limit")).toBe(false);
    });

    it("reports progress as a large export streams in, and completes", async () => {
      const chunk = "x".repeat(100_000);
      const chunks = Array.from({ length: 50 }, () => chunk);
      vi.mocked(apiFetch).mockResolvedValue(csvResponse(chunks));
      const onProgress = vi.fn();

      await downloadTransactionsCsv(ADDRESS, {}, { onProgress });

      expect(onProgress).toHaveBeenCalledTimes(50);
      expect(onProgress).toHaveBeenNthCalledWith(1, { bytesReceived: 100_000 });
      expect(onProgress).toHaveBeenLastCalledWith({ bytesReceived: 5_000_000 });
      expect(downloaded).toHaveLength(1);
      expect(downloaded[0].blob.size).toBe(5_000_000);
    });

    it("passes the abort signal to the request", async () => {
      vi.mocked(apiFetch).mockResolvedValue(csvResponse());
      const controller = new AbortController();

      await downloadTransactionsCsv(ADDRESS, {}, { signal: controller.signal });

      expect(vi.mocked(apiFetch).mock.calls[0][1]).toMatchObject({
        signal: controller.signal,
      });
    });

    it("throws an ApiError and downloads nothing when the export fails", async () => {
      vi.mocked(apiFetch).mockResolvedValue(
        new Response("nope", { status: 500, statusText: "Server Error" }),
      );

      await expect(downloadTransactionsCsv(ADDRESS)).rejects.toMatchObject({
        name: ApiError.name,
        status: 500,
      });
      expect(downloaded).toHaveLength(0);
    });
  });

  describe("buildExportFilename", () => {
    it("uses the UTC date", () => {
      expect(buildExportFilename(new Date("2026-11-18T23:59:59Z"))).toBe(
        "stow-transactions-2026-11-18.csv",
      );
    });
  });

  describe("formatBytes", () => {
    it.each([
      [0, "0 B"],
      [1023, "1023 B"],
      [1024, "1.0 KB"],
      [1536, "1.5 KB"],
      [5_000_000, "4.8 MB"],
      [3 * 1024 ** 3, "3.0 GB"],
    ])("formats %d bytes as %s", (bytes, expected) => {
      expect(formatBytes(bytes)).toBe(expected);
    });
  });
});
