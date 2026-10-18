/**
 * Payload formats a deposit QR code can encode:
 *  - "address" — the bare Stellar account (G...), understood by any wallet.
 *  - "sep7" — a SEP-7 `web+stellar:pay` payment request, which lets
 *    SEP-7-aware wallets pre-fill the destination, asset and amount.
 */
export type DepositQrFormat = "address" | "sep7";

export interface DepositQrAsset {
  code: string;
  /** Issuer account; omit for the native asset (XLM). */
  issuer?: string;
}

export interface DepositQrPayloadOptions {
  format: DepositQrFormat;
  address: string;
  asset?: DepositQrAsset;
  /** Optional decimal amount (e.g. "25.5"); ignored when not a positive number. */
  amount?: string;
  memo?: string;
}

/**
 * Builds the text a deposit QR code encodes for the given `format`. SEP-7
 * params follow https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md:
 * a native asset omits `asset_code`/`asset_issuer`, and a memo is sent as a
 * `MEMO_TEXT`.
 */
export function buildDepositQrPayload({
  format,
  address,
  asset,
  amount,
  memo,
}: DepositQrPayloadOptions): string {
  if (format === "address") return address;

  const params = new URLSearchParams({ destination: address });

  const trimmedAmount = amount?.trim() ?? "";
  const numericAmount = Number(trimmedAmount);
  if (trimmedAmount !== "" && Number.isFinite(numericAmount) && numericAmount > 0) {
    params.set("amount", trimmedAmount);
  }

  if (asset && asset.code.toUpperCase() !== "XLM") {
    params.set("asset_code", asset.code);
    if (asset.issuer) params.set("asset_issuer", asset.issuer);
  }

  const trimmedMemo = memo?.trim() ?? "";
  if (trimmedMemo !== "") {
    params.set("memo", trimmedMemo);
    params.set("memo_type", "MEMO_TEXT");
  }

  return `web+stellar:pay?${params.toString()}`;
}
