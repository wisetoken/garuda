import { formatUnits, getAddress, parseUnits, type Address } from "viem";

export const paymentTokens = [
  { symbol: "WISE", address: getAddress("0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6"), decimals: 18 },
  { symbol: "WETH", address: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"), decimals: 18 },
  { symbol: "USDC", address: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), decimals: 6 },
] as const;
export type PaymentToken = typeof paymentTokens[number];
export function paymentToken(address: string): PaymentToken {
  const token = paymentTokens.find(token => token.address.toLowerCase() === address.toLowerCase());
  if (!token) throw new Error("Unsupported payment token. Choose WISE, WETH or USDC.");
  return token;
}
export function paymentSchema(d: { paymentSchemaVersion?: number }): 1 | 2 {
  if (d.paymentSchemaVersion !== undefined && d.paymentSchemaVersion !== 1 && d.paymentSchemaVersion !== 2)
    throw new Error("Unsupported payment schema.");
  return d.paymentSchemaVersion ?? 1;
}
export function supportedPaymentTokens(d: { paymentSchemaVersion?: number }) {
  return paymentSchema(d) === 2 ? paymentTokens : paymentTokens.slice(0, 1);
}
export function acceptsPayment(d: { currency: Address; paymentSchemaVersion?: number }, currency: string) {
  return paymentSchema(d) === 1 ? currency.toLowerCase() === d.currency.toLowerCase()
    : paymentTokens.some(token => token.address.toLowerCase() === currency.toLowerCase());
}
export function parsePaymentAmount(value: string, currency: string): bigint {
  const token = paymentToken(currency), text = value.trim();
  if (!new RegExp(`^(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,${token.decimals}})?$`).test(text))
    throw new Error(`Enter a ${token.symbol} amount with up to ${token.decimals} decimal places.`);
  const amount = parseUnits(text, token.decimals);
  if (amount <= 0n || amount >= 1n << 128n) throw new Error("Enter a positive amount within the order limit.");
  return amount;
}
export function formatPaymentAmount(value: bigint, currency: string, precision?: number) {
  const token = paymentToken(currency);
  const [whole, fraction = ""] = formatUnits(value, token.decimals).split(".");
  const digits = fraction.slice(0, precision ?? token.decimals).replace(/0+$/, "");
  return `${BigInt(whole).toLocaleString("en-US")}${digits ? `.${digits}` : ""}`;
}
export function formatTokenBalance(value: bigint, currency: string) {
  const decimals = paymentToken(currency).decimals;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(Math.max(decimals - 2, 0));
  const scaled = decimals >= 2 ? (abs + unit / 2n) / unit : abs * 10n ** BigInt(2 - decimals);
  const whole = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}.${fraction}`;
}
export type PaymentPrices = Partial<Record<PaymentToken["symbol"], number>>;
export function paymentUsdValue(value: bigint, currency: string, prices: PaymentPrices): number | undefined {
  const token = paymentToken(currency), price = prices[token.symbol];
  if (price === undefined || !Number.isFinite(price) || price <= 0) return undefined;
  return Number(formatUnits(value, token.decimals)) * price;
}
export function paymentUsd(value: bigint, currency: string, prices: PaymentPrices) {
  const usd = paymentUsdValue(value, currency, prices);
  return usd === undefined ? "USD unavailable" : usd > 0 && usd < .01 ? "≈ <$0.01" : `≈ ${usd.toLocaleString("en-US", {style:"currency",currency:"USD"})}`;
}
