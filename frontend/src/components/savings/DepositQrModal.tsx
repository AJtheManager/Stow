"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, X } from "lucide-react";
import QRCode from "qrcode";
import { copyToClipboard } from "@/lib/clipboard";
import {
  buildDepositQrPayload,
  type DepositQrAsset,
  type DepositQrFormat,
} from "@/lib/depositQr";

const QR_SIZE = 240;
const QR_COLORS = { dark: "#05070d", light: "#eef2ff" };

const FORMAT_LABELS: Record<DepositQrFormat, string> = {
  address: "Address",
  sep7: "Payment request",
};

const FORMAT_DESCRIPTIONS: Record<DepositQrFormat, string> = {
  address: "Plain Stellar address — works with any wallet.",
  sep7: "SEP-7 payment link — compatible wallets pre-fill asset and amount.",
};

type CopyStatus = "idle" | "copied" | "error";

export interface DepositQrModalProps {
  open: boolean;
  onClose: () => void;
  /** Stellar account deposits should be sent to. */
  address: string;
  /** Assets the payer can choose between for SEP-7 requests. Defaults to XLM. */
  assets?: DepositQrAsset[];
}

const DEFAULT_ASSETS: DepositQrAsset[] = [{ code: "XLM" }];

function downloadFile(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Modal showing a QR code for depositing into `address`. Supports encoding
 * either the bare address or a SEP-7 payment request (with optional asset
 * and amount), copying the encoded value, and downloading the code as PNG
 * or SVG.
 */
export default function DepositQrModal({
  open,
  onClose,
  address,
  assets = DEFAULT_ASSETS,
}: DepositQrModalProps) {
  const [format, setFormat] = useState<DepositQrFormat>("address");
  const [assetCode, setAssetCode] = useState(assets[0]?.code ?? "XLM");
  const [amount, setAmount] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const resetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const asset = assets.find((a) => a.code === assetCode) ?? assets[0];
  const payload = buildDepositQrPayload({ format, address, asset, amount });

  useEffect(() => {
    return () => {
      if (resetTimeout.current) clearTimeout(resetTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusableElements =
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
      if (!focusableElements || focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleTab);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQrError(false);
    QRCode.toDataURL(payload, {
      margin: 1,
      width: QR_SIZE,
      color: QR_COLORS,
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, payload]);

  if (!open) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(payload);
    setCopyStatus(success ? "copied" : "error");
    if (resetTimeout.current) clearTimeout(resetTimeout.current);
    resetTimeout.current = setTimeout(() => setCopyStatus("idle"), 2000);
  };

  const handleDownloadPng = () => {
    if (qrDataUrl) downloadFile(qrDataUrl, `stow-deposit-${format}.png`);
  };

  const handleDownloadSvg = async () => {
    try {
      const svg = await QRCode.toString(payload, {
        type: "svg",
        margin: 1,
        width: QR_SIZE,
        color: QR_COLORS,
      });
      const url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      downloadFile(url, `stow-deposit-${format}.svg`);
      URL.revokeObjectURL(url);
    } catch {
      setQrError(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-qr-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-background-elevated p-6 shadow-2xl mx-4"
        role="document"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-4 top-4 rounded-lg p-1 text-muted hover:bg-card hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50"
        >
          <X className="h-5 w-5" />
        </button>

        <h2
          id="deposit-qr-title"
          className="text-xl font-semibold text-foreground mb-1"
        >
          Deposit QR code
        </h2>
        <p className="text-sm text-muted mb-4">
          Scan with a Stellar wallet to send funds to your Stow account.
        </p>

        <div
          role="radiogroup"
          aria-label="QR code format"
          className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1 mb-2"
        >
          {(Object.keys(FORMAT_LABELS) as DepositQrFormat[]).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={format === value}
              onClick={() => setFormat(value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 ${
                format === value
                  ? "bg-brand/20 text-brand"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {FORMAT_LABELS[value]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted mb-4">{FORMAT_DESCRIPTIONS[format]}</p>

        {format === "sep7" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-4">
            <div>
              <label
                htmlFor="deposit-qr-asset"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Asset
              </label>
              <select
                id="deposit-qr-asset"
                value={assetCode}
                onChange={(e) => setAssetCode(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
              >
                {assets.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="deposit-qr-amount"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Amount (optional)
              </label>
              <input
                id="deposit-qr-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/50"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          {qrError ? (
            <p
              role="alert"
              className="max-w-[240px] text-center text-sm text-red-400"
            >
              Couldn&apos;t generate the QR code.
            </p>
          ) : qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`QR code for ${payload}`}
              width={QR_SIZE}
              height={QR_SIZE}
              className="rounded-lg"
            />
          ) : (
            <div
              role="status"
              aria-label="Generating QR code"
              className="h-[240px] w-[240px] animate-pulse rounded-lg bg-white/5"
            />
          )}

          <p className="w-full break-all text-center font-mono text-xs text-muted">
            {payload}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand/20 hover:bg-brand/30 border border-brand/40 px-4 py-2.5 text-sm font-medium text-brand transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            {copyStatus === "copied" ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copyStatus === "copied" ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={!qrDataUrl || qrError}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-card/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            PNG
          </button>
          <button
            type="button"
            onClick={handleDownloadSvg}
            disabled={qrError}
            className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-card/70 px-4 py-2.5 text-sm font-medium text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand/50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            SVG
          </button>
        </div>

        {copyStatus === "error" && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            Couldn&apos;t copy automatically — please copy manually.
          </p>
        )}
      </div>
    </div>
  );
}
