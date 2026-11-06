import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useActiveAccount,
  useActiveWallet,
  useActiveWalletChain,
} from "thirdweb/react";
import { ethereum } from "thirdweb/chains";
import { viemAdapter } from "thirdweb/adapters/viem";
import { getAddress } from "viem";
import { thirdwebClient, useWalletAccess } from "../wallet";
import { ethereumClient } from "../portfolio";
import { stakeCollection, STAKE_COLLECTIONS } from "../blend/stake-collections";
import { parseAmount } from "../blend/domain";
import {
  parseSignedSale,
  sameAddress,
  type SalesConfig,
  type SignedSale,
  type SaleRow,
} from "../blend/sales";
import {
  publishSale,
  approveBid,
  fillSale,
  cancelSale,
  randomSaleNonce,
  type SalesSession,
  type SalesStep,
} from "../blend/sales-wallet";
import { salesFailure } from "../blend/sales-errors";
import { marketApi, validateConfig, orderAvailable } from "./api";
import {
  prepareRecovery,
  rememberOrder,
  forgetCancelledOrder,
} from "./recovery";
import { orderSuccess, settlementSuccess, type MarketSuccess } from "./success";
import type { MarketIntent, PendingTx } from "./types";
import { refreshTradeData, tradeDestination } from "./workflow";
import { useAppToast } from "../../components/AppToast";

export function useMarketController() {
  const { showToast } = useAppToast();
  const account = useActiveAccount(),
    wallet = useActiveWallet(),
    chain = useActiveWalletChain();
  const { connect } = useWalletAccess(),
    cache = useQueryClient(),
    navigate = useNavigate();
  const [intent, setIntent] = useState<MarketIntent | null>(null),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState<SalesStep>("checking");
  const [revision, setRevision] = useState(0),
    [pending, setPending] = useState<PendingTx | null>(null);
  const [success, setSuccess] = useState<MarketSuccess | null>(null);
  const [unsaved, setUnsaved] = useState<SignedSale | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false),
    connecting = useRef(false),
    context = useRef({ account, wallet }),
    phase = useRef<SalesStep>("checking");
  context.current = { account, wallet };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const previousAccount = useRef(account?.address);
  useEffect(() => {
    if (previousAccount.current && previousAccount.current !== account?.address && !lock.current) {
      setIntent(null);
    }
    previousAccount.current = account?.address;
  }, [account?.address]);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          `garuda:pending:${account?.address.toLowerCase()}`,
        ) ?? "null",
      );
      setPending(saved && /^0x[0-9a-f]{64}$/i.test(saved.hash) ? saved : null);
    } catch {
      setPending(null);
    }
  }, [account?.address]);
  useEffect(() => {
    if (intent) {
      dialog.current?.showModal();
      const old = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = old;
        dialog.current?.close();
      };
    }
  }, [Boolean(intent)]);
  useEffect(() => {
    if (!busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [busy]);
  function open(next: MarketIntent) {
    if (lock.current) return;
    setSuccess(null);
    setIntent(next);
  }
  async function connectForTrade() {
    if (lock.current || connecting.current) return;
    connecting.current = true;
    // Keep the form mounted so its price and duration survive the wallet picker.
    // Native dialogs sit above portals, so lower this dialog while connecting.
    dialog.current?.close();
    try {
      await connect();
    } finally {
      connecting.current = false;
      if (mounted.current && dialog.current?.isConnected && !dialog.current.open)
        dialog.current.showModal();
    }
  }
  function refresh() {
    void refreshTradeData(cache);
    setRevision((v) => v + 1);
  }
  async function execute(price: string, days: number, approvalOnly = false) {
    if (!intent || lock.current) return;
    lock.current = true;
    setBusy(true);
    phase.current = "checking";
    setStep("checking");
    const activeIntent = intent;
    try {
      if (!account || !wallet || !thirdwebClient)
        throw new Error("Connect your wallet first.");
      if (pending && !pending.confirmed)
        throw new Error(
          "Check the pending transaction before starting another action.",
        );
      if (unsaved && activeIntent.kind !== "cancel")
        throw new Error("Review the signed order before starting another action.");
      const address = getAddress(account.address),
        expectedWallet = wallet;
      const collection =
        "position" in activeIntent
          ? (activeIntent.position.collection ??
            STAKE_COLLECTIONS.signature.address)
          : getAddress(activeIntent.row.order.collection);
      const id = stakeCollection(collection).id;
      // Cancellation also works with the last known verified deployment during an API outage.
      let config: SalesConfig;
      try {
        config = validateConfig(await marketApi<SalesConfig>(id, "config"), id);
      } catch (e) {
        if (activeIntent.kind !== "cancel") throw e;
        config = validateConfig(
          JSON.parse(
            localStorage.getItem(`garuda:market-config:${id}:v1`) ?? "null",
          ),
          id,
        );
      }
      if (!config.enabled) throw new Error(config.reason);
      if (
        activeIntent.kind !== "cancel" &&
        (config.recoveryOnly || config.newActivityPaused)
      )
        throw new Error(
          "New trading is paused or unavailable. Please try again later.",
        );
      const d = config.deployment,
        txKey = `garuda:pending:${address.toLowerCase()}`;
      let lastTx: PendingTx | null = null;
      const session: SalesSession = {
        requireBidApproval: true,
        client: ethereumClient,
        deployment: d,
        address,
        wallet: viemAdapter.walletClient.toViem({
          account,
          client: thirdwebClient,
          chain: ethereum,
        }) as unknown as SalesSession["wallet"],
        assertWallet: async () => {
          const current = context.current;
          if (
            !mounted.current ||
            current.wallet !== expectedWallet ||
            !sameAddress(current.account?.address ?? "", address) ||
            !sameAddress(expectedWallet.getAccount()?.address ?? "", address) ||
            expectedWallet.getChain()?.id !== 1
          )
            throw new Error(
              "Wallet or network changed. Review the action again on Ethereum.",
            );
        },
        validateSale: async (signed) => {
          const hash = parseSignedSale(signed, d).hash;
          const row = await marketApi<SaleRow>(id, `sales/${hash}`);
          if (row.hash !== hash || !orderAvailable(row))
            throw new Error(
              "This order is no longer available. Refresh the market.",
            );
        },
        onStep: (value) => {
          phase.current = value;
          setStep(value);
        },
        rememberSignature: (signed) => {
          setUnsaved(signed);
          rememberOrder(localStorage, d, address, signed);
          setRevision((v) => v + 1);
        },
        onTransaction: (hash, kind) => {
          lastTx = { hash, kind, confirmed: false };
          setPending(lastTx);
          showToast(`${kind} submitted`, {
            id: `trade-tx:${hash}`,
            link: { label: "View on Etherscan", href: `https://etherscan.io/tx/${hash}` },
          });
          try {
            localStorage.setItem(txKey, JSON.stringify(lastTx));
          } catch {
            /* Hash remains visible. */
          }
        },
        onConfirmed: () => {
          if (lastTx) {
            lastTx = { ...lastTx, confirmed: true };
            setPending(lastTx);
            try {
              localStorage.setItem(txKey, JSON.stringify(lastTx));
            } catch {
              /* Receipt remains visible. */
            }
          }
        },
      };
      if (activeIntent.kind === "list" || activeIntent.kind === "bid") {
        if (activeIntent.kind === "bid" && approvalOnly) {
          await approveBid(session, parseAmount(price));
          showToast("WISE approved. You can now sign and publish your bid.");
          return;
        }
        prepareRecovery(localStorage, d, address); // Verify storage before asking for a signature.
        const amount = parseAmount(price);
        const signed = await publishSale(
          session,
          {
            kind: activeIntent.kind === "list" ? 0 : 1,
            tokenId: BigInt(activeIntent.position.tokenId),
            amount,
            days,
            nonce: randomSaleNonce(),
          },
          (signed) => marketApi(id, "sales", signed),
        );
        setSuccess(orderSuccess(signed, d, tradeDestination(activeIntent, id)));
      } else if (activeIntent.kind === "fill") {
        const result = await fillSale(session, activeIntent.row);
        setSuccess(settlementSuccess(result));
      } else {
        await cancelSale(session, activeIntent.row);
        try {
          forgetCancelledOrder(localStorage, d, address, activeIntent.row);
        } catch {
          /* A cancelled signature is safe to retain. */
        }
        showToast("Order cancelled on Ethereum.");
      }
      if (
        activeIntent.kind !== "cancel" ||
        (unsaved?.order.nonce === activeIntent.row.order.nonce &&
          sameAddress(unsaved.order.maker, activeIntent.row.order.maker))
      )
        setUnsaved(null);
      refresh();
      if (activeIntent.kind === "cancel") {
        setIntent(null);
        navigate(tradeDestination(activeIntent, id));
      }
    } catch (e) {
      showToast(salesFailure(e, phase.current), { tone: "error" });
      refresh();
    } finally {
      await cache.invalidateQueries({ queryKey: ["bid-allowance"] });
      lock.current = false;
      setBusy(false);
    }
  }
  async function checkPending() {
    if (!pending || !account) return;
    const pendingAddress = account.address;
    const link = { label: "View on Etherscan", href: `https://etherscan.io/tx/${pending.hash}` };
    try {
      const receipt = await ethereumClient.getTransactionReceipt({
        hash: pending.hash,
      });
      const block = await ethereumClient.getBlockNumber();
      if (block - receipt.blockNumber + 1n < 12n) {
        showToast("Transaction included; waiting for 12 confirmations.", { link });
        return;
      }
      if (!sameAddress(context.current.account?.address ?? "", pendingAddress))
        return;
      const next = { ...pending, confirmed: true };
      setPending(next);
      localStorage.setItem(
        `garuda:pending:${account?.address.toLowerCase()}`,
        JSON.stringify(next),
      );
      showToast(
        receipt.status === "success"
          ? (pending.kind === "WISE approval" ? "WISE approval confirmed. Continue to sign your bid." : pending.kind === "WISE allowance reset" ? "Allowance reset confirmed. Approve WISE to continue." : "Transaction confirmed. Review the current order state before continuing.")
          : "Transaction reverted. Refresh and review before trying again.",
        { tone: receipt.status === "success" ? "info" : "error", link },
      );
      await cache.invalidateQueries({ queryKey: ["bid-allowance"] });
      refresh();
    } catch {
      showToast(
        "The transaction is not confirmed yet. Check its status on Etherscan.",
        { link },
      );
    }
  }

  return {
    intent,
    setIntent,
    success,
    viewSuccess: () => {
      if (!success || lock.current) return;
      setIntent(null);
      navigate(success.destination);
    },
    busy,
    step,
    revision,
    pending,
    unsaved,
    dialog,
    open,
    execute,
    checkPending,
    connect: connectForTrade,
    wallet,
    chain,
  };
}
