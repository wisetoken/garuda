import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useActiveAccount } from "thirdweb/react";
import { orderAvailable, useMarkets } from "../lib/market/api";
import { useBook, useOrderAvailability } from "../lib/market/queries";
import { sameAddress, type SaleRow } from "../lib/blend/sales";
import { stakeCollection } from "../lib/blend/stake-collections";
import { wiseAmount } from "../lib/portfolio";
import { screenHref } from "../navigation";

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
    const [tracked, setTracked] = useState(address);
    const [seen, setSeen] = useState<Set<string>>(() => address ? readSeen(address) : new Set());
    const [open, setOpen] = useState(false);
    const [shown, setShown] = useState<SaleRow[]>([]);
    const root = useRef<HTMLDivElement>(null);
    if (tracked !== address) {
        setTracked(address);
        setSeen(address ? readSeen(address) : new Set());
        setOpen(false);
        setShown([]);
    }
    const unseen = incoming.filter((row) => !seen.has(row.hash));
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
    if (!address || (!unseen.length && !open)) return null;
    const count = unseen.length;
    const label = count === 1 ? "1 new purchase bid on your stakes" : count ? `${count} new purchase bids on your stakes` : "Purchase bids on your stakes";
    function toggle() {
        if (open) {
            setOpen(false);
            return;
        }
        setShown(unseen);
        if (address && unseen.length) setSeen(rememberSeen(address, unseen.map((row) => row.hash)));
        setOpen(true);
    }
    return (
        <div className="bid-alert" ref={root}>
            <span className="bid-alert-live" role="status">{count ? label : ""}</span>
            <button className="theme-toggle" type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
                <Bell size={20} aria-hidden="true" />
                {count > 0 && <span className="bid-alert-badge">{count > 9 ? "9+" : count}</span>}
            </button>
            {open && <div className="bid-alert-panel" role="dialog" aria-label="New purchase bids">
                <strong>New bids on your stakes</strong>
                <ul>
                    {shown.map((row) => <li key={row.hash}>
                        <Link to={`${screenHref("trade")}&book=bids`} onClick={() => setOpen(false)}>
                            {stakeLabel(row.order.collection, row.order.tokenId)}
                            <span>{wiseAmount(BigInt(row.order.amount))} WISE</span>
                        </Link>
                    </li>)}
                </ul>
            </div>}
        </div>
    );
}
