import { useErrorToast } from "../AppToast";
import { useActiveAccount } from "thirdweb/react";
import { useMarketActions } from "../MarketActions";
import type { SalesDeployment } from "../../lib/blend/sales";
import { readRecovery } from "../../lib/market/recovery";
import { stakeCollection } from "../../lib/blend/stake-collections";
import { formatAmount } from "../../lib/blend/domain";
import { useState } from "react";
import { downloadOrderBackup } from "../../lib/backup/export";

export function SavedOrders({
  deployments,
}: {
  deployments: SalesDeployment[];
}) {
  const account = useActiveAccount(),
    { open, revision, busy } = useMarketActions();
  const [exportNotice, setExportNotice] = useState("");
  void revision;
  const groups = (account ? deployments : []).map((d) => {
    try {
      return {
        d,
        orders: readRecovery(localStorage, d, account!.address),
        error: false,
      };
    } catch {
      return { d, orders: [], error: true };
    }
  });
  useErrorToast("saved-orders", groups.some(group => group.error) && "Saved orders could not be read. New signatures stay blocked to protect this data.");
  if (!groups.some((g) => g.orders.length)) return null;
  return (
    <details className="market-recovery">
      <summary>Saved signed orders</summary>
      <p>
        Orders signed on this device are kept here, including failed publish
        attempts. A signature can remain valid until expiry or onchain
        cancellation.
      </p>
      <button type="button" className="market-secondary" disabled={busy} onClick={() => {
        if (!account) return;
        try { setExportNotice(`Exported ${downloadOrderBackup(account.address)} Signature orders. Keep the backup private until the orders expire or are cancelled.`); }
        catch { setExportNotice("Export failed. Keep this browser's saved data and use the CROPS page for independent access."); }
      }}>Export Signature order backup</button>
      <p role="status">{exportNotice}</p>
      {groups.map(({ d, orders, error }) => (
        <div key={d.collection}>
          {!error && (
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
