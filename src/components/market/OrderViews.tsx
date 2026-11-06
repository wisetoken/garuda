import { formatPaymentAmount, paymentToken, paymentUsd } from "../../lib/blend/payment-tokens";
import { usePaymentPrices } from "../../lib/market/payment-prices";
import { ArtworkBackupDialog } from "./ArtworkBackupDialog";
import { ArkivPublication } from "./ArkivSource";
import { RowMenu } from "./RowMenu";
import { CalendarPlus, ExternalLink, HandCoins, Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { AddressIdentity } from "../AddressIdentity";
import { StakeCard } from "../StakeCard";
import { ExtendOfferDialog } from "./ExtendOfferDialog";
import { useMarketActions } from "../MarketActions";
import { orderAvailable } from "../../lib/market/api";
import { useOrderPosition } from "../../lib/market/queries";
import { type SaleRow, sameAddress } from "../../lib/blend/sales";
import type { SignaturePosition } from "../../lib/blend/live-portfolio";
import { stakeCollection } from "../../lib/blend/stake-collections";

export function RowActions({
  row,
  position,
}: {
  row: SaleRow;
  position?: SignaturePosition;
}) {
  const account = useActiveAccount(),
    { open, busy } = useMarketActions();
  const [extendOpen, setExtendOpen] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  const maker = !!account && sameAddress(account.address, row.order.maker),
    owner = !!account && sameAddress(account.address, row.order.owner),
    available = orderAvailable(row);
  let primary;
  if (maker)
    primary = (
      <button
        className="market-secondary"
        disabled={busy || ["sold", "cancelled-or-filled"].includes(row.status)}
        onClick={() => open({ kind: "cancel", row, initialPosition: position })}
      >
        {row.order.kind === 0 ? "Cancel Sale" : "Cancel"}
      </button>
    );
  else if (row.order.kind === 1 && owner)
    primary = (
      <button
        className="market-primary"
        disabled={busy}
        onClick={() => open({ kind: "fill", row, initialPosition: position })}
      >
        Accept
      </button>
    );
  else if (row.order.kind === 0) primary = (
    <button className="market-primary" disabled={busy || owner}
      onClick={() => open({ kind: "fill", row, initialPosition: position })}>Buy Stake</button>
  );
  const key = row.arkivEntity ?? row.arkiv?.entityKey;
  const entity = key && /^0x[0-9a-f]{64}$/i.test(key) ? key : undefined;
  const canBid = !maker && row.order.kind === 0 && !owner;
  return <div className="market-row-actions">
    {extendOpen && entity && <ExtendOfferDialog row={row} entity={entity} onClose={() => setExtendOpen(false)} />}
    {artworkOpen && <ArtworkBackupDialog row={row} onClose={() => setArtworkOpen(false)} />}
    {primary}
    <RowMenu label={`More actions for ${stakeCollection(row.order.collection).name} Stake #${row.order.tokenId}`}>
      {maker && entity && <button type="button" role="menuitem" disabled={busy || !available}
        onClick={() => setExtendOpen(true)}><CalendarPlus aria-hidden="true" />Extend offer</button>}
      {canBid && <button type="button" role="menuitem" disabled={busy || !position?.canList}
        onClick={() => position && open({ kind: "bid", position })}><HandCoins aria-hidden="true" />Place Bid</button>}
      {entity && <a role="menuitem" href={`https://rabdi.explorer.arkiv.network/entity/${entity}`} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true" />View on Arkiv</a>}
      <button type="button" role="menuitem" onClick={() => setArtworkOpen(true)}><ImageIcon aria-hidden="true" />Artwork backup</button>
    </RowMenu>
  </div>;
}

export function OrderCard({ row }: { row: SaleRow }) {
  const position = useOrderPosition(row), prices = usePaymentPrices();
  if (!position.data)
    return (
      <article className="state-panel">
        <h2>
          {stakeCollection(row.order.collection).name} Stake #{row.order.tokenId}
        </h2>
        {position.isFetching && <p role="status">Reading stake details…</p>}
        {position.isError && (
          <button disabled={position.isFetching} onClick={() => void position.refetch()}>Refresh details</button>
        )}
        <RowActions row={row} />
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
          <div className="market-card-summary">
            <div className="market-card-price">
              <span>{row.order.kind === 0 ? "Asking price" : "Bid price"}</span>
              <strong>{formatPaymentAmount(BigInt(row.order.amount),row.order.currency,6)} {paymentToken(row.order.currency).symbol}</strong>
              <small>{paymentUsd(BigInt(row.order.amount),row.order.currency,prices)}</small>
            </div>
            <div className="market-card-parties">
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
            </div>
          </div>
          <RowActions row={row} position={position.data} />
          {!(row.arkivEntity ?? row.arkiv?.entityKey) && <ArkivPublication row={row} />}
        </>
      }
    />
  );
}
