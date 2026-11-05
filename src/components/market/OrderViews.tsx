import { useActiveAccount } from "thirdweb/react";
import { AddressIdentity } from "../AddressIdentity";
import { StakeCard } from "../StakeCard";
import { useMarketActions } from "../MarketActions";
import { orderAvailable } from "../../lib/market/api";
import { useOrderPosition } from "../../lib/market/queries";
import { type SaleRow, sameAddress } from "../../lib/blend/sales";
import type { SignaturePosition } from "../../lib/blend/live-portfolio";
import { stakeCollection } from "../../lib/blend/stake-collections";
import { useWiseUsd, usdAmount } from "../../lib/portfolio";
import { formatAmount } from "../../lib/blend/domain";

export function RowActions({
  row,
  position,
}: {
  row: SaleRow;
  position?: SignaturePosition;
}) {
  const account = useActiveAccount(),
    { open, busy } = useMarketActions();
  const maker = !!account && sameAddress(account.address, row.order.maker),
    owner = !!account && sameAddress(account.address, row.order.owner),
    available = orderAvailable(row);
  if (maker)
    return (
      <button
        className="market-secondary"
        disabled={busy || ["sold", "cancelled-or-filled"].includes(row.status)}
        onClick={() => open({ kind: "cancel", row })}
      >
        Cancel onchain
      </button>
    );
  if (row.order.kind === 1)
    return owner ? (
      <button
        className="market-primary"
        disabled={busy || !available || !position}
        onClick={() => open({ kind: "fill", row })}
      >
        Accept Bid
      </button>
    ) : (
      <span className="market-muted">
        {available ? "Awaiting owner" : "Unavailable"}
      </span>
    );
  return (
    <div className="market-row-actions">
      <button
        className="market-primary"
        disabled={busy || !available || !position || owner}
        onClick={() => open({ kind: "fill", row })}
      >
        Buy Stake
      </button>
      <button
        className="market-secondary"
        disabled={busy || !position?.canList || owner}
        onClick={() => position && open({ kind: "bid", position })}
      >
        Place Bid
      </button>
    </div>
  );
}
export function OrderCard({ row }: { row: SaleRow }) {
  const position = useOrderPosition(row),
    { data: usd } = useWiseUsd();
  if (!position.data)
    return (
      <article className="state-panel">
        <h2>
          {stakeCollection(row.order.collection).name} Stake #{row.order.tokenId}
        </h2>
        <p>
          {position.isError
            ? "Stake details unavailable."
            : "Reading stake details…"}
        </p>
        {position.isError && (
          <button onClick={() => void position.refetch()}>Try again</button>
        )}
      </article>
    );
  return (
    <StakeCard
      position={position.data}
      actions={
        <>
          {!orderAvailable(row) && (
            <p className="market-muted">
              Order: {row.status.replaceAll("-", " ")}
            </p>
          )}
          <div className="market-card-price">
            <span>{row.order.kind === 0 ? "Asking price" : "Bid price"}</span>
            <strong>{formatAmount(BigInt(row.order.amount), 6)} WISE</strong>
            <small>{usdAmount(BigInt(row.order.amount), usd)}</small>
          </div>
          <div className="market-card-owner">
            <span>Owner</span>
            <AddressIdentity address={row.order.owner} />
          </div>
          {row.order.kind === 1 && (
            <div className="market-card-owner">
              <span>Bidder</span>
              <AddressIdentity address={row.order.maker} />
            </div>
          )}
          <RowActions row={row} position={position.data} />
        </>
      }
    />
  );
}
