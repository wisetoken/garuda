import { CheckCircle2, ExternalLink } from "lucide-react";
import { formatAmount } from "../../lib/blend/domain";
import { stakeCollection } from "../../lib/blend/stake-collections";
import type { SettlementSuccess as Receipt } from "../../lib/market/success";
import { SuccessFrame } from "./SuccessFrame";

export function SettlementSuccess({ receipt, onClose, onView }: {
  receipt: Receipt; onClose: () => void; onView: () => void;
}) {
  const purchased = receipt.action === "purchase", meta = stakeCollection(receipt.collection);
  const wise = (amount: bigint) => `${formatAmount(amount, 18)} WISE`;
  return <SuccessFrame
    receiptKey={receipt.transactionHash}
    title={purchased ? "Stake purchased!" : "Bid accepted!"}
    description={purchased ? "The stake has been transferred to your wallet." : "Your stake has been sold and the WISE payment received."}
    next={purchased ? "You now own the stake. Its original maturity date stays the same." : "The bidder now owns the stake. The amount received is after the marketplace fee."}
    viewLabel={purchased ? "View my stakes" : "View purchase bids"}
    onClose={onClose} onView={onView}
  >
    <div className="order-success-summary">
      <p>{meta.name} Stake #{receipt.tokenId}</p>
      <strong>{wise(purchased ? receipt.gross : receipt.net)}</strong>
      <span>{purchased ? "You paid" : "You received"}</span>
      <dl>
        {!purchased && <div><dt>Accepted bid</dt><dd>{wise(receipt.gross)}</dd></div>}
        <div><dt>Marketplace fee</dt><dd>{wise(receipt.fee)}</dd></div>
        {purchased && <div><dt>Seller received</dt><dd>{wise(receipt.net)}</dd></div>}
      </dl>
    </div>
    <div className="order-success-publication" role="status">
      <CheckCircle2 size={16} aria-hidden="true" /><span>Confirmed on Ethereum</span>
    </div>
    <dl className="order-success-receipt">
      <div><dt>Transaction</dt><dd>
        <a href={`https://etherscan.io/tx/${receipt.transactionHash}`} target="_blank" rel="noopener noreferrer" title={receipt.transactionHash}>
          View on Etherscan <ExternalLink size={14} aria-hidden="true" />
        </a>
      </dd></div>
      <div><dt>Order hash</dt><dd><code title={receipt.hash}>{receipt.hash.slice(0, 10)}…{receipt.hash.slice(-8)}</code></dd></div>
    </dl>
  </SuccessFrame>;
}
