import { paymentTokens } from "../blend/payment-tokens";
import { sameAddress } from "../blend/sales";

export type SaleNotice = {
    id: string;
    seller: string;
    collection: string;
    tokenId: string;
    currency?: string;
    net: string;
    transactionHash: string;
};

const storageKey = "garuda:sale-notices:v1";
export const saleNoticeEvent = "garuda:sale-notices";

function addressOf(value: unknown) {
    return typeof value === "string" && /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : undefined;
}
function uintOf(value: unknown) {
    if (typeof value === "string" && /^\d+$/.test(value)) return value;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    return undefined;
}
function txOf(value: unknown) {
    return typeof value === "string" && /^0x[0-9a-f]{64}$/i.test(value) ? value : undefined;
}

export function saleNoticeId(transactionHash: string) {
    return `sale:${transactionHash.toLowerCase()}`;
}

export function createSaleNotice(input: {
    seller: string;
    collection: string;
    tokenId: string;
    currency?: string;
    net: bigint;
    transactionHash: string;
}): SaleNotice | null {
    if (input.currency !== undefined && (typeof input.currency !== "string" || !paymentTokens.some(t => t.address.toLowerCase() === input.currency?.toLowerCase()))) return null;
    const seller = addressOf(input.seller);
    const transactionHash = txOf(input.transactionHash);
    const tokenId = uintOf(input.tokenId);
    if (!seller || !transactionHash || !tokenId || input.net < 0n) return null;
    return {
        id: saleNoticeId(transactionHash),
        seller,
        collection: input.collection,
        tokenId,
        net: input.net.toString(),
        ...(input.currency ? {currency: input.currency} : {}),
        transactionHash,
    };
}

export function saleNoticeFromActivity(event: {
    tx_hash: string;
    event_name: string;
    payload?: Record<string, string>;
}): SaleNotice | null {
    if (event.event_name !== "SaleValidated") return null;
    const payload = event.payload ?? {};
    if (payload.currency !== undefined && (typeof payload.currency !== "string" || !paymentTokens.some(t => t.address.toLowerCase() === payload.currency.toLowerCase()))) return null;
    const seller = addressOf(payload.seller);
    const tokenId = uintOf(payload.tokenId);
    const gross = uintOf(payload.amount);
    const transactionHash = txOf(event.tx_hash);
    if (!seller || !tokenId || !gross || !transactionHash) return null;
    const fee = BigInt(uintOf(payload.fee) ?? "0");
    const amount = BigInt(gross);
    return {
        id: saleNoticeId(transactionHash),
        seller,
        collection: "",
        tokenId,
        ...(payload.currency ? {currency: payload.currency} : {}),
        net: (amount > fee ? amount - fee : amount).toString(),
        transactionHash,
    };
}

export function mergeSaleNotices(local: SaleNotice[], discovered: SaleNotice[]) {
    const merged = new Map<string, SaleNotice>();
    for (const notice of discovered) merged.set(notice.id, notice);
    for (const notice of local) {
        const previous = merged.get(notice.id);
        merged.set(notice.id, { ...previous, ...notice, collection: notice.collection || previous?.collection || "" });
    }
    return [...merged.values()];
}

function readStored(): SaleNotice[] {
    try {
        const raw = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
        if (!Array.isArray(raw)) return [];
        return raw.flatMap((item) => {
            const notice = createSaleNotice({
                seller: item?.seller,
                collection: typeof item?.collection === "string" ? item.collection : "",
                tokenId: item?.tokenId,
                currency: item?.currency,
                net: uintOf(item?.net) ? BigInt(item.net) : -1n,
                transactionHash: item?.transactionHash,
            });
            return notice ? [notice] : [];
        });
    } catch {
        return [];
    }
}

export function recordSoldStake(input: {
    seller: string;
    collection: string;
    tokenId: string;
    currency?: string;
    net: bigint;
    transactionHash: string;
}) {
    const notice = createSaleNotice(input);
    if (!notice) return;
    const next = mergeSaleNotices(readStored(), [notice]);
    localStorage.setItem(storageKey, JSON.stringify(next.slice(-50)));
    window.dispatchEvent(new Event(saleNoticeEvent));
}

export function storedSaleNotices(seller: string) {
    return readStored().filter((notice) => sameAddress(notice.seller, seller));
}
