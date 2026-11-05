import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveAccount } from "thirdweb/react";
import { getAddress } from "viem";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import {
  ethereumClient,
  useWiseUsd,
  wiseAmount,
  usdAmount,
} from "../../lib/portfolio";
import {
  loadSignaturePortfolio,
  type SignaturePosition,
} from "../../lib/blend/live-portfolio";
import {
  stakeCollection,
  STAKE_COLLECTIONS,
} from "../../lib/blend/stake-collections";
import {
  stakeDate,
  stakeTimeline,
  stakeYield,
} from "../../lib/blend/stake-art";
import { parseAmount, formatAmount, amountInput } from "../../lib/blend/domain";
import { saleAmounts } from "../../lib/blend/seaport";
import {
  sameAddress,
  tokenSalesAbi,
  type SaleRow,
} from "../../lib/blend/sales";
import { marketApi, useMarkets, orderAvailable } from "../../lib/market/api";
import type { MarketIntent } from "../../lib/market/types";

export function SaleForm({
  intent,
  busy,
  status,
  error,
  blocked,
  execute,
  connect,
  switchChain,
  correctChain,
  onBid,
}: {
  intent: MarketIntent;
  busy: boolean;
  status: string;
  error: string;
  blocked: boolean;
  execute: (price: string, days: number) => Promise<void>;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  correctChain: boolean;
  onBid: (position: SignaturePosition) => void;
}) {
  const account = useActiveAccount(),
    { data: usd } = useWiseUsd(),
    markets = useMarkets();
  const [price, setPrice] = useState(() =>
      intent.kind === "list" ? amountInput(intent.position.principal) : "",
    ),
    [days, setDays] = useState(7),
    [touched, setTouched] = useState(false);
  const collection =
      "position" in intent
        ? (intent.position.collection ?? STAKE_COLLECTIONS.signature.address)
        : getAddress(intent.row.order.collection),
    meta = stakeCollection(collection);
  const tokenId =
    "position" in intent ? intent.position.tokenId : intent.row.order.tokenId;
  const owner =
    "position" in intent ? intent.position.owner : intent.row.order.owner;
  const config = markets[meta.id === "signature" ? 0 : 1];
  const live = useQuery({
    queryKey: ["market-review", collection, tokenId, owner],
    queryFn: async () => {
      const p = await loadSignaturePortfolio(
        ethereumClient,
        owner,
        1,
        collection,
        [String(tokenId)],
      );
      return p.positions[0];
    },
    enabled: intent.kind !== "cancel",
    staleTime: 0,
  });
  const position =
    live.data ?? ("position" in intent ? intent.position : undefined);
  const availability = useQuery({
    queryKey: [
      "market-order-review",
      intent.kind === "fill" ? intent.row.hash : "",
    ],
    queryFn: () =>
      marketApi<SaleRow>(
        meta.id,
        `sales/${intent.kind === "fill" ? intent.row.hash : ""}`,
      ),
    enabled: intent.kind === "fill",
    staleTime: 0,
    refetchInterval: 15_000,
  });
  const balance = useQuery({
    queryKey: ["wise-balance", account?.address],
    queryFn: () =>
      ethereumClient.readContract({
        address: config.data?.enabled
          ? config.data.deployment.currency
          : "0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6",
        abi: tokenSalesAbi,
        functionName: "balanceOf",
        args: [getAddress(account!.address)],
      }),
    enabled: !!account && (intent.kind === "bid" || intent.kind === "fill"),
    staleTime: 10_000,
  });
  let amount: bigint | undefined,
    amountError = "";
  try {
    amount =
      "row" in intent ? BigInt(intent.row.order.amount) : parseAmount(price);
  } catch {
    amount = undefined;
  }
  if (amount !== undefined && amount >= (1n << 128n)) {
    amount = undefined;
    amountError = "This amount exceeds the supported order limit.";
  }
  const feeBps = config.data?.enabled
    ? config.data.deployment.feeBps
    : meta.purchaseFeeBps;
  const amounts =
    amount === undefined ? undefined : saleAmounts({ amount, feeBps });
  const buy = intent.kind === "fill" && intent.row.order.kind === 0;
  const paying = intent.kind === "bid" || buy;
  const wrongOwner =
    account &&
    (((intent.kind === "list" || (intent.kind === "fill" && !buy)) &&
      !sameAddress(account.address, owner)) ||
      (intent.kind === "bid" && sameAddress(account.address, owner)) ||
      (buy && sameAddress(account.address, owner)) ||
      (intent.kind === "cancel" &&
        !sameAddress(account.address, intent.row.order.maker)));
  const tradingBlocked =
    intent.kind !== "cancel" &&
    (config.isError ||
      !config.data?.enabled ||
      config.data.recoveryOnly ||
      config.data.newActivityPaused);
  const unavailable =
    intent.kind === "fill" &&
    (!availability.data ||
      availability.isError ||
      !orderAvailable(availability.data));
  const insufficient =
    paying &&
    amount !== undefined &&
    balance.data !== undefined &&
    balance.data < amount;
  const title =
    intent.kind === "list"
      ? "List your stake"
      : intent.kind === "bid"
        ? "Place a bid"
        : intent.kind === "cancel"
          ? "Cancel this order"
          : buy
            ? "Review purchase"
            : "Accept this bid";
  const action =
    intent.kind === "list"
      ? "Sign & publish listing"
      : intent.kind === "bid"
        ? "Sign & publish bid"
        : intent.kind === "cancel"
          ? "Cancel onchain"
          : buy
            ? "Confirm purchase"
            : "Accept Bid";
  const timeline = position ? stakeTimeline(position) : undefined,
    yieldValue = position ? stakeYield(position) : null;
  const submitBlocked =
    !account || !correctChain || busy || blocked || !!wrongOwner ||
    tradingBlocked || unavailable || insufficient || amount === undefined ||
    (intent.kind !== "cancel" &&
      (live.isPending || live.isError || !position?.canList)) ||
    (paying && (balance.isPending || balance.isError));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!submitBlocked) void execute(price, days);
      }}
    >
      <header className="sale-heading">
        <h2 id="sale-title">{title}</h2>
        <p>
          {intent.kind === "list"
            ? "Set your asking price and how long the listing stays open."
            : intent.kind === "bid"
              ? "Choose your price for full stake ownership."
              : intent.kind === "cancel"
                ? "Cancel the signed order so it can no longer be filled."
                : "Review the position and the exact WISE payment."}
        </p>
      </header>
      <div className="sale-layout">
        <section className="sale-position">
          <div className="sale-identity">
            <img src="/wiseone-logo.png" width="40" height="48" alt="" />
            <div>
              <span>WISE / Ethereum</span>
              <h3>
                {meta.name} #{tokenId}
              </h3>
            </div>
          </div>
          {position && (
            <>
              <div className="sale-status">
                <span>{timeline?.status}</span>
                <span>{timeline?.caption}</span>
              </div>
              <dl className="sale-facts">
                <div>
                  <dt>Staked principal</dt>
                  <dd>
                    {wiseAmount(position.principal)} WISE
                    <small>{usdAmount(position.principal, usd)}</small>
                  </dd>
                </div>
                <div>
                  <dt>Unclaimed interest</dt>
                  <dd>
                    {wiseAmount(position.unclaimedInterest)} WISE
                    <small>{usdAmount(position.unclaimedInterest, usd)}</small>
                  </dd>
                </div>
                <div>
                  <dt>Annualized yield*</dt>
                  <dd>
                    {yieldValue === null ? "—" : `${yieldValue.toFixed(2)}%`}
                  </dd>
                </div>
              </dl>
              <div className="sale-dates">
                <div>
                  <span>Started / UTC</span>
                  <strong>{stakeDate(position.startAt)}</strong>
                </div>
                <div>
                  <span>Maturity / UTC</span>
                  <strong>{stakeDate(position.maturesAt)}</strong>
                </div>
              </div>
              <p className="sale-fineprint">
                *Simple historical yield, not a promised return. Interest
                excludes previously scraped rewards.
              </p>
            </>
          )}
          {intent.kind !== "cancel" && live.isPending && (
            <p role="status">Checking stake details…</p>
          )}
          {live.isError && (
            <p role="alert">
              Could not verify stake details.{" "}
              <button type="button" onClick={() => void live.refetch()}>
                Retry
              </button>
            </p>
          )}
          <p className="sale-note">
            <ShieldCheck size={18} />
            <span>
              {intent.kind === "list"
                ? "The stake stays in your wallet until a buyer completes the purchase."
                : "Ownership changes without restarting the stake’s maturity date."}
            </span>
          </p>
        </section>
        <section className="sale-terms">
          {intent.kind === "list" || intent.kind === "bid" ? (
            <>
              <label htmlFor="sale-price">
                {intent.kind === "list" ? "Asking price" : "Your bid"}
              </label>
              <div className="sale-amount">
                <input
                  id="sale-price"
                  autoFocus
                  inputMode="decimal"
                  placeholder="0.00"
                  value={price}
                  disabled={busy}
                  onBlur={() => setTouched(true)}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-invalid={touched && amount === undefined}
                  aria-describedby={
                    touched && amountError ? "sale-price-error" : undefined
                  }
                />
                <span>WISE</span>
              </div>
              {touched && amountError && (
                <p className="sale-error" id="sale-price-error">
                  {amountError}
                </p>
              )}
              <label htmlFor="sale-days">
                {intent.kind === "list" ? "Listing duration" : "Bid duration"}
              </label>
              <select
                id="sale-days"
                value={days}
                disabled={busy}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {[1, 3, 7, 30].map((n) => (
                  <option value={n} key={n}>
                    {n} {n === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span className="sale-label">
                {buy ||
                (intent.kind === "cancel" && intent.row.order.kind === 0)
                  ? "Asking price"
                  : "Bid price"}
              </span>
              <p className="sale-total">
                {amount === undefined ? "—" : formatAmount(amount, 18)}{" "}
                <small>WISE</small>
              </p>
              <p className="sale-fineprint">{usdAmount(amount, usd)}</p>
            </>
          )}
          {amounts && (
            <dl className="sale-breakdown">
              <div>
                <dt>Buyer pays</dt>
                <dd>{formatAmount(amounts.gross, 18)} WISE</dd>
              </div>
              <div>
                <dt>Marketplace fee ({feeBps / 100}%)</dt>
                <dd>{formatAmount(amounts.fee, 18)} WISE</dd>
              </div>
              <div>
                <dt>Seller receives</dt>
                <dd>{formatAmount(amounts.net, 18)} WISE</dd>
              </div>
            </dl>
          )}
          {buy && position && (
            <button
              className="sale-bid-link"
              type="button"
              disabled={busy}
              onClick={() => onBid(position)}
            >
              Place a bid instead <ArrowUpRight size={16} />
            </button>
          )}
          {paying && account && (
            <div className="sale-wallet-balance">
              <span>Wallet balance</span>
              <strong>
                {balance.data === undefined
                  ? "Checking…"
                  : `${wiseAmount(balance.data)} WISE`}
              </strong>
              {balance.isError && <span>Balance could not be verified.</span>}
              {insufficient && (
                <span className="sale-error">
                  Insufficient WISE for this {buy ? "purchase" : "bid"}.
                </span>
              )}
            </div>
          )}
          <p className="sale-fineprint">
            {intent.kind === "list"
              ? "Approve this NFT if needed, then sign the listing. Signing does not transfer ownership. Ethereum gas is separate."
              : intent.kind === "bid"
                ? "Approve the exact WISE amount, then sign your bid. Funds are not escrowed. The owner may accept until expiry or onchain cancellation."
                : intent.kind === "cancel"
                  ? "Cancellation requires an Ethereum transaction. Closing this dialog does not cancel an order."
                  : "Approve WISE if needed, then confirm the transfer in your wallet. Ethereum gas is separate."}
          </p>
        </section>
      </div>
      {tradingBlocked && (
        <p className="sale-error" role="status">
          {config.isPending
            ? "Checking market availability…"
            : !config.data?.enabled && config.data
              ? config.data.reason
              : "Trading is temporarily unavailable. Refresh to try again."}
        </p>
      )}
      {wrongOwner && (
        <p className="sale-error" role="alert">
          This action requires a different wallet. Connect the appropriate owner
          or buyer account.
        </p>
      )}
      {unavailable && (
        <p className="sale-error" role="status">
          {availability.isPending
            ? "Checking this order…"
            : "This order is not currently available."}
        </p>
      )}
      {error && (
        <p className="sale-error" role="alert">
          {error}
        </p>
      )}
      <footer className="sale-footer">
        {status && <p role="status">{status}</p>}
        {!account ? (
          <button
            className="stake-primary"
            type="button"
            onClick={() => void connect()}
          >
            Connect wallet
          </button>
        ) : !correctChain ? (
          <button
            className="stake-primary"
            type="button"
            disabled={busy}
            onClick={() => void switchChain()}
          >
            Switch to Ethereum
          </button>
        ) : (
          <button
            className="stake-primary"
            type="submit"
            disabled={submitBlocked}
          >
            {busy ? "Check your wallet…" : action}
          </button>
        )}
      </footer>
    </form>
  );
}
