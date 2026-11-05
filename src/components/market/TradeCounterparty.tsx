import type { SaleRow } from "../../lib/blend/sales";
import { AddressIdentity } from "../AddressIdentity";

export function TradeCounterparty({ row }: { row: SaleRow }) {
  const bid = row.order.kind === 1;
  const expiry = new Date(Number(row.order.deadline) * 1000);
  return (
    <div className="sale-counterparty">
      <div>
        <span>{bid ? "Bidder receives your stake" : "Current owner"}</span>
        <AddressIdentity address={bid ? row.order.maker : row.order.owner} />
      </div>
      <div>
        <span>Expires / UTC</span>
        <time dateTime={expiry.toISOString()}>
          {expiry.toLocaleString("en-GB", { timeZone: "UTC", day: "numeric",
            month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </time>
      </div>
    </div>
  );
}
