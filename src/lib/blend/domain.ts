/** Exact-value primitives shared by the preview and future settlement adapters. */
export type MarketCurrency = "WISE" | "ETH";
export const DAY = 86_400;
export const YEAR = 365 * DAY;
export const UNIT = 10n ** 18n;
export const UINT256_MAX = (1n << 256n) - 1n;

export const COLLECTIONS = [
    {
        id: "wise-signature",
        name: "WiseOne Signature",
        chainId: 1,
        address: "0x48791dbdfb38baa58e48329148c321bf33b3c1e1",
        collateralAdapter: "wise-signature-v1",
        // Listing in the preview does not qualify an asset for live settlement.
        liveTradingEnabled: false,
        liveLendingEnabled: false,
    },
] as const;

export function parseAmount(value: string): bigint {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value.trim())) {
        throw new Error(
            "Enter a positive amount with up to 18 decimal places.",
        );
    }
    const [whole, fraction = ""] = value.trim().split(".");
    const amount = BigInt(whole) * UNIT + BigInt(fraction.padEnd(18, "0"));
    if (amount <= 0n || amount > UINT256_MAX)
        throw new Error(
            "Amount must be greater than zero and within the token limit.",
        );
    return amount;
}

export function amountInput(amount: bigint): string {
    const fraction = (amount % UNIT)
        .toString()
        .padStart(18, "0")
        .replace(/0+$/, "");
    return `${amount / UNIT}${fraction ? `.${fraction}` : ""}`;
}

/** Display only: truncates to precision; exact base units remain authoritative. */
export function formatAmount(amount: bigint, precision = 4): string {
    const whole = (amount / UNIT).toLocaleString("en-US");
    const fraction = (amount % UNIT)
        .toString()
        .padStart(18, "0")
        .slice(0, precision)
        .replace(/0+$/, "");
    return `${whole}${fraction ? `.${fraction}` : ""}`;
}

export function parseApr(value: string): number {
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value))
        throw new Error(
            "Enter an APR from 0 to 100%, with up to two decimal places.",
        );
    const [whole, fraction = ""] = value.split(".");
    const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (bps > 10_000) throw new Error("Preview APR cannot exceed 100%.");
    return bps;
}

export type LoanTerms = {
    principal: bigint;
    currency: MarketCurrency;
    aprBps: number;
    duration: number;
    grace: number;
    minInterestSeconds: number;
};

export function validateTerms(terms: LoanTerms): void {
    if (terms.principal <= 0n || terms.principal > UINT256_MAX)
        throw new Error("Invalid principal.");
    if (terms.currency !== "WISE" && terms.currency !== "ETH")
        throw new Error("Unsupported currency.");
    if (
        ![
            terms.aprBps,
            terms.duration,
            terms.grace,
            terms.minInterestSeconds,
        ].every(Number.isSafeInteger)
    )
        throw new Error("Loan terms must use whole base units.");
    if (terms.aprBps < 0 || terms.aprBps > 10_000)
        throw new Error("Invalid APR.");
    if (
        terms.duration < DAY ||
        terms.duration > 90 * DAY ||
        terms.grace < 0 ||
        terms.grace > 7 * DAY
    )
        throw new Error("Invalid term or grace period.");
    if (
        terms.minInterestSeconds < 0 ||
        terms.minInterestSeconds > terms.duration
    )
        throw new Error("Invalid minimum interest period.");
}

export function loanInterest(terms: LoanTerms, elapsedSeconds: number): bigint {
    validateTerms(terms);
    if (!Number.isSafeInteger(elapsedSeconds))
        throw new Error("Invalid elapsed time.");
    const seconds = Math.min(
        terms.duration,
        Math.max(0, elapsedSeconds, terms.minInterestSeconds),
    );
    const numerator = terms.principal * BigInt(terms.aprBps) * BigInt(seconds);
    const denominator = 10_000n * BigInt(YEAR);
    return (numerator + denominator - 1n) / denominator;
}

export function repaymentAmount(
    terms: LoanTerms,
    elapsedSeconds: number,
): bigint {
    const debt = terms.principal + loanInterest(terms, elapsedSeconds);
    if (debt > UINT256_MAX) throw new Error("Repayment exceeds token limit.");
    return debt;
}

export function loanPhase(
    startedAt: number,
    terms: LoanTerms,
    now: number,
): "active" | "grace" | "claimable" {
    if (now > startedAt + terms.duration + terms.grace) return "claimable";
    if (now > startedAt + terms.duration) return "grace";
    return "active";
}

export function supportsBlendHost(host: string): boolean {
    const hostname = host.toLowerCase();
    return (
        hostname === "pro.wise.one" ||
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "[::1]" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".vercel.app")
    );
}
