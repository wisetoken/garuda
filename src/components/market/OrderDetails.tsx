import { useOrderPosition } from "../../lib/market/queries";
import type { SaleRow } from "../../lib/blend/sales";
import { saleAmounts } from "../../lib/blend/seaport";
import { stakeCollection } from "../../lib/blend/stake-collections";
import { formatAmount } from "../../lib/blend/domain";
import { marketDate } from "../../lib/market/presentation";
import { RowActions } from "./OrderViews";

export function OrderDetails({ row }: { row: SaleRow }) {
  const { data: position } = useOrderPosition(row);
  const amounts = saleAmounts({
    amount: BigInt(row.order.amount),
    feeBps: row.order.feeBps,
  });
  return (
    <section
      className="market-order-details"
      aria-label="Selected order details"
    >
      <div>
        <h2>
          {stakeCollection(row.order.collection).name} Stake #{row.order.tokenId}
        </h2>
        <p>
          {row.order.kind === 0 ? "Sale listing" : "Purchase bid"} ·{" "}
          {row.status === "available"
            ? "Available"
            : row.status.replaceAll("-", " ")}
        </p>
      </div>
      <dl>
        <div>
          <dt>{row.order.kind === 0 ? "Asking price" : "Bid price"}</dt>
          <dd>{formatAmount(BigInt(row.order.amount), 6)} WISE</dd>
        </div>
        <div>
          <dt>Marketplace fee</dt>
          <dd>{row.order.feeBps / 100}%</dd>
        </div>
        <div>
          <dt>Seller receives</dt>
          <dd>{formatAmount(amounts.net, 6)} WISE</dd>
        </div>
        <div>
          <dt>Expires / UTC</dt>
          <dd>{marketDate(Number(row.order.deadline))}</dd>
        </div>
      </dl>
      <div className="market-detail-actions">
        <RowActions row={row} position={position} />
      </div>
      <p className="market-detail-note">
        Complete NFT ownership transfers on purchase. Ownership and stake state
        are checked again before settlement.
      </p>
    </section>
  );
}
