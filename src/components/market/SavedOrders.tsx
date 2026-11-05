import { useActiveAccount } from "thirdweb/react";
import { useMarketActions } from "../MarketActions";
import type { SalesDeployment } from "../../lib/blend/sales";
import { readRecovery } from "../../lib/market/recovery";
import { stakeCollection } from "../../lib/blend/stake-collections";
import { formatAmount } from "../../lib/blend/domain";

export function SavedOrders({
  deployments,
}: {
  deployments: SalesDeployment[];
}) {
  const account = useActiveAccount(),
    { open, revision, busy } = useMarketActions();
  void revision;
  if (!account) return null;
  const groups = deployments.map((d) => {
    try {
      return {
        d,
        orders: readRecovery(localStorage, d, account.address),
        error: false,
      };
    } catch {
      return { d, orders: [], error: true };
    }
  });
  if (!groups.some((g) => g.orders.length || g.error)) return null;
  return (
    <details className="market-recovery">
      <summary>Saved signed orders</summary>
      <p>
        Orders signed on this device are kept here, including failed publish
        attempts. A signature can remain valid until expiry or onchain
        cancellation.
      </p>
      {groups.map(({ d, orders, error }) => (
        <div key={d.collection}>
          {error ? (
            <p role="alert">
              Saved orders could not be read. New signatures are blocked to
              protect this data.
            </p>
          ) : (
            orders.map((row) => (
              <div className="recovery-row" key={row.order.nonce}>
                <span>
                  {stakeCollection(row.order.collection).name} Stake #
                  {row.order.tokenId} ·{" "}
                  {row.order.kind === 0 ? "Listing" : "Bid"} ·{" "}
                  {formatAmount(BigInt(row.order.amount), 6)} WISE
                </span>
                <button
                  className="market-secondary"
                  disabled={busy}
                  onClick={() => open({ kind: "cancel", row })}
                >
                  Review cancellation
                </button>
              </div>
            ))
          )}
        </div>
      ))}
    </details>
  );
}
