import { paymentToken, paymentTokens, formatPaymentAmount } from "../lib/blend/payment-tokens";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useActiveAccount } from "thirdweb/react";
import { orderAvailable, useMarkets } from "../lib/market/api";
import { useBook, useOrderAvailability } from "../lib/market/queries";
import { sameAddress, type SaleRow } from "../lib/blend/sales";
import { stakeCollection } from "../lib/blend/stake-collections";
import { screenHref } from "../navigation";
import { mergeSaleNotices, saleNoticeEvent, saleNoticeFromActivity, storedSaleNotices, type SaleNotice } from "../lib/market/sale-notices";

type AlertItem = { type: "bid"; row: SaleRow } | { type: "sale"; notice: SaleNotice };

const seenKey = (address: string) => `garuda:seen-bids:${address.toLowerCase()}`;

function readSeen(address: string) {
    try {
        const raw = JSON.parse(localStorage.getItem(seenKey(address)) ?? "[]");
        return new Set(Array.isArray(raw) ? raw.filter((value): value is string => typeof value === "string") : []);
    } catch {
        return new Set<string>();
    }
}

function rememberSeen(address: string, hashes: string[]) {
    const next = [...readSeen(address), ...hashes].slice(-200);
    localStorage.setItem(seenKey(address), JSON.stringify(next));
    return new Set(next);
}

function stakeLabel(collection: string, tokenId: string) {
    try {
        return `${stakeCollection(collection).name} Stake #${tokenId}`;
    } catch {
        return `Stake #${tokenId}`;
    }
}

export function BidAlerts() {
    const account = useActiveAccount();
    const address = account?.address;
    const markets = useMarkets();
    const deployments = markets.map((query) => query.data?.enabled ? query.data.deployment : undefined);
    const owned = address ? { stakeOwner: address } : {};
    const signature = useBook("signature", address ? deployments[0] : undefined, "arkiv", "bid", undefined, "desc", owned);
    const advanced = useBook("advanced", address ? deployments[1] : undefined, "arkiv", "bid", undefined, "desc", owned);
    const indexed = [...new Map(
        [...(signature.data?.pages ?? []), ...(advanced.data?.pages ?? [])]
            .flatMap((page) => page.orders)
            .filter((row) => row.order.kind === 1 && !!address && sameAddress(row.order.owner, address) && !sameAddress(row.order.maker, address))
            .map((row) => [row.hash, row]),
    ).values()];
    const availability = useOrderAvailability(indexed);
    const incoming = indexed.filter((row, index) => {
        const check = availability[index];
        const status = row.status === "checking" && check && !check.isError ? check.data ?? row.status : row.status;
        return orderAvailable({ ...row, status });
    });
    const activity = [...(signature.data?.pages ?? []), ...(advanced.data?.pages ?? [])].flatMap((page) => page.activity ?? []);
    const [noticeRevision, setNoticeRevision] = useState(0);
    const [tracked, setTracked] = useState(address);
    const [seen, setSeen] = useState<Set<string>>(() => address ? readSeen(address) : new Set());
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const refresh = () => setNoticeRevision((current) => current + 1);
        window.addEventListener(saleNoticeEvent, refresh);
        window.addEventListener("storage", refresh);
        return () => {
            window.removeEventListener(saleNoticeEvent, refresh);
            window.removeEventListener("storage", refresh);
        };
    }, []);
    if (tracked !== address) {
        setTracked(address);
        setSeen(address ? readSeen(address) : new Set());
        setOpen(false);
    }
    const sales = (address && noticeRevision >= 0) ? mergeSaleNotices(
        storedSaleNotices(address),
        activity.flatMap((event) => {
            const notice = saleNoticeFromActivity(event);
            return notice && sameAddress(notice.seller, address) ? [notice] : [];
        }),
    ) : [];
    const alerts: AlertItem[] = [
        ...sales.map((notice) => ({ type: "sale" as const, notice })),
        ...incoming.map((row) => ({ type: "bid" as const, row })),
    ];
    const unseen = alerts.filter((item) => !seen.has(item.type === "sale" ? item.notice.id : item.row.hash));
    useEffect(() => {
        if (!open) return;
        function onPointer(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }
        document.addEventListener("pointerdown", onPointer);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointer);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);
    if (!address || (!alerts.length && !open)) return null;
    const saleCount = unseen.filter((item) => item.type === "sale").length;
    const bidCount = unseen.filter((item) => item.type === "bid").length;
    const parts = [
        saleCount === 1 ? "1 stake sold" : saleCount ? `${saleCount} stakes sold` : "",
        bidCount === 1 ? "1 new purchase bid" : bidCount ? `${bidCount} new purchase bids` : "",
    ].filter(Boolean);
    const label = parts.join(", ") || "Updates on your stakes";
    function toggle() {
        if (open) {
            setOpen(false);
            return;
        }
        if (address && unseen.length) setSeen(rememberSeen(address, unseen.map((item) => item.type === "sale" ? item.notice.id : item.row.hash)));
        setOpen(true);
    }
    return (
        <div className="bid-alert" ref={root}>
            <span className="bid-alert-live" role="status">{saleCount || bidCount ? label : ""}</span>
            <button className="theme-toggle" type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
                <Bell size={20} aria-hidden="true" />
                {(saleCount + bidCount) > 0 && <span className="bid-alert-badge">{saleCount + bidCount > 9 ? "9+" : saleCount + bidCount}</span>}
            </button>
            {open && <div className="bid-alert-panel" role="dialog" aria-label="Stake updates">
                <strong>{alerts.some((item) => item.type === "sale") ? "Your stakes" : "New bids on your stakes"}</strong>
                <ul>
                    {alerts.map((item) => item.type === "sale" ? <li key={item.notice.id}>
                        <a href={`https://etherscan.io/tx/${item.notice.transactionHash}`} target="_blank" rel="noopener noreferrer">
                            {stakeLabel(item.notice.collection, item.notice.tokenId)} sold
                            <span>{formatPaymentAmount(BigInt(item.notice.net),item.notice.currency ?? paymentTokens[0].address,6)} {paymentToken(item.notice.currency ?? paymentTokens[0].address).symbol}</span>
                        </a>
                    </li> : <li key={item.row.hash}>
                        <Link to={`${screenHref("trade")}&book=bids`} onClick={() => setOpen(false)}>
                            {stakeLabel(item.row.order.collection, item.row.order.tokenId)}
                            <span>{formatPaymentAmount(BigInt(item.row.order.amount),item.row.order.currency,6)} {paymentToken(item.row.order.currency).symbol}</span>
                        </Link>
                    </li>)}
                </ul>
            </div>}
        </div>
    );
}
